import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { TaskTemplate } from "@/types/database";

export const runtime = "nodejs";

/**
 * 반복 업무 자동 발행 (Vercel Cron — vercel.json, 매일 KST 00:20).
 * 인증: Authorization: Bearer ${CRON_SECRET} (Vercel이 자동 첨부).
 * 오늘(KST)이 발행일인 활성 템플릿을 tasks로 발행한다.
 * - last_issued_ym('YYYY-MM')으로 같은 달 중복 발행 방지 (멱등 — 재실행 안전)
 * - 발행일이 그 달에 없으면(29~31) 말일에 발행
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
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  const admin = createAdminClient();
  const { data: templatesData, error } = await admin
    .from("task_templates")
    .select("*")
    .eq("active", true);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const due = ((templatesData ?? []) as TaskTemplate[]).filter(
    (t) =>
      t.last_issued_ym !== ym &&
      (t.issue_day === day || (t.issue_day > lastDay && day === lastDay)),
  );
  if (due.length === 0) {
    return NextResponse.json({ ok: true, ym, day, issued: 0 });
  }

  // 템플릿 → 계약 서비스 → 클라이언트 매핑
  const svcIds = [...new Set(due.map((t) => t.client_service_id))];
  const { data: svcRows } = await admin
    .from("client_services")
    .select("id, client_id")
    .in("id", svcIds);
  const clientOf = new Map(
    ((svcRows ?? []) as { id: string; client_id: string }[]).map((s) => [
      s.id,
      s.client_id,
    ]),
  );

  let issued = 0;
  const failures: string[] = [];
  for (const t of due) {
    const { error: insErr } = await admin.from("tasks").insert({
      title: t.title,
      client_id: clientOf.get(t.client_service_id) ?? null,
      assignee_id: t.assignee_id,
      status: "todo",
      task_type: t.task_type,
      priority: t.priority,
      template_id: t.id,
      created_by: t.created_by,
    });
    if (insErr) {
      failures.push(`${t.title}: ${insErr.message}`);
      continue;
    }
    await admin
      .from("task_templates")
      .update({ last_issued_ym: ym, updated_at: new Date().toISOString() })
      .eq("id", t.id);
    issued += 1;
  }

  return NextResponse.json({ ok: failures.length === 0, ym, day, issued, failures });
}
