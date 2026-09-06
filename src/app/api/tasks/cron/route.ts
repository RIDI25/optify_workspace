import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { TaskTemplate } from "@/types/database";

export const runtime = "nodejs";

/**
 * 반복 업무 자동 발행 (Vercel Cron — vercel.json, 매일 KST 00:20).
 * 인증: Authorization: Bearer ${CRON_SECRET} (Vercel이 자동 첨부). 미들웨어 공개 경로에 등록돼 있어 로그인 없이 도달한다.
 *
 * 규칙 (2026-09-06 코덱스 검토 반영)
 * - 이번 달에 아직 발행하지 않았고 오늘이 발행일 이후면 발행한다 → 하루 실패해도 다음 날 따라잡는다.
 * - 발행일이 그 달에 없으면(29~31) 말일에 발행.
 * - 계약(client_services)이 진행중이고 기간 안에 있을 때만 발행. 종료·중지·기간 밖은 건너뛴다.
 * - tasks.issued_ym + 유니크 인덱스(0026)로 같은 달 중복 생성을 DB 에서 막는다 (동시 호출·중간 실패 안전).
 * - 생성 업무에 마감일(due_date)을 발행일로 넣어 일정·마감 조회에 잡히게 한다.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET 미설정 — Vercel 환경변수에 추가하세요." },
      { status: 500 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const kst = new Date(Date.now() + 9 * 3_600_000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const day = kst.getUTCDate();
  const ym = `${y}-${String(m + 1).padStart(2, "0")}`;
  const today = `${ym}-${String(day).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const effectiveDay = (issueDay: number) => Math.min(issueDay, lastDay);

  const admin = createAdminClient();
  const { data: templatesData, error } = await admin
    .from("task_templates")
    .select("*")
    .eq("active", true);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const due = ((templatesData ?? []) as TaskTemplate[]).filter(
    (t) => t.last_issued_ym !== ym && day >= effectiveDay(t.issue_day),
  );
  if (due.length === 0) {
    return NextResponse.json({ ok: true, ym, day, issued: 0, skipped: 0 });
  }

  // 템플릿 → 계약 서비스(상태·기간) → 클라이언트
  const svcIds = [...new Set(due.map((t) => t.client_service_id))];
  const { data: svcRows } = await admin
    .from("client_services")
    .select("id, client_id, status, start_date, end_date")
    .in("id", svcIds);
  type Svc = { id: string; client_id: string; status: string; start_date: string | null; end_date: string | null };
  const svcOf = new Map(((svcRows ?? []) as Svc[]).map((s) => [s.id, s]));
  const contractLive = (s: Svc | undefined) =>
    !!s &&
    s.status === "active" &&
    (!s.start_date || s.start_date <= today) &&
    (!s.end_date || s.end_date >= today);

  let issued = 0;
  let skipped = 0;
  let duplicates = 0;
  const failures: string[] = [];
  for (const t of due) {
    const svc = svcOf.get(t.client_service_id);
    if (!contractLive(svc)) {
      skipped += 1; // 계약이 끝났거나 아직 시작 전 — last_issued_ym 은 건드리지 않는다
      continue;
    }
    const dueDate = `${ym}-${String(effectiveDay(t.issue_day)).padStart(2, "0")}`;
    const { error: insErr } = await admin.from("tasks").insert({
      title: t.title,
      client_id: svc!.client_id,
      assignee_id: t.assignee_id,
      due_date: dueDate,
      status: "todo",
      task_type: t.task_type,
      priority: t.priority,
      template_id: t.id,
      issued_ym: ym,
      created_by: t.created_by,
    });
    if (insErr) {
      if (insErr.code === "23505") {
        duplicates += 1; // 이미 이번 달 발행됨 (동시 호출·이전 중단) — 기록만 맞춘다
      } else {
        failures.push(`${t.title}: ${insErr.message}`);
        continue;
      }
    } else {
      issued += 1;
    }
    await admin
      .from("task_templates")
      .update({ last_issued_ym: ym, updated_at: new Date().toISOString() })
      .eq("id", t.id);
  }

  return NextResponse.json({ ok: failures.length === 0, ym, day, issued, skipped, duplicates, failures });
}
