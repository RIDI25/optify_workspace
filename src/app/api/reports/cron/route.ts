import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchGscSnapshot } from "@/lib/google/gsc";
import { fetchGa4Snapshot } from "@/lib/google/ga4";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 서치콘솔·GA4 자동 갱신 (Vercel Cron — vercel.json, 매일 KST 00:30).
 * 인증: Authorization: Bearer ${CRON_SECRET}. 미들웨어 공개 경로에 등록돼 있다.
 * - 매주 월요일: 자동 갱신을 켠 고객사의 '이번 달 1일 ~ 어제' 자료를 다시 불러와 저장 (reports.gsc_snapshot/ga4_snapshot)
 * - 매월 2일: '지난달 전체'를 불러와 저장 (확정치)
 * 그 밖의 날은 아무것도 하지 않는다. 화면의 '지금 불러오기'와 같은 함수·같은 저장 위치를 쓴다.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET 미설정 — Vercel 환경변수에 추가하세요." }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const kst = new Date(Date.now() + 9 * 3_600_000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth(); // 0-based
  const day = kst.getUTCDate();
  const dow = kst.getUTCDay();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymOf = (yy: number, mm: number) => `${yy}-${pad(mm + 1)}`;
  const lastDayOf = (yy: number, mm: number) => new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();

  const jobs: { ym: string; start: string; end: string; why: string }[] = [];
  if (dow === 1 && day > 1) {
    jobs.push({ ym: ymOf(y, m), start: `${ymOf(y, m)}-01`, end: `${ymOf(y, m)}-${pad(day - 1)}`, why: "월요일 이번 달 갱신" });
  }
  if (day === 2) {
    const py = m === 0 ? y - 1 : y;
    const pm = m === 0 ? 11 : m - 1;
    jobs.push({ ym: ymOf(py, pm), start: `${ymOf(py, pm)}-01`, end: `${ymOf(py, pm)}-${pad(lastDayOf(py, pm))}`, why: "2일 지난달 확정" });
  }
  if (jobs.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "월요일·2일이 아님" });
  }

  const admin = createAdminClient();
  const { data: clientsData, error } = await admin
    .from("clients")
    .select("id, name, gsc_site_url, ga4_property_id")
    .eq("google_auto_fetch", true)
    .eq("status", "active");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  type C = { id: string; name: string; gsc_site_url: string | null; ga4_property_id: string | null };
  const clients = ((clientsData ?? []) as C[]).filter((c) => c.gsc_site_url || c.ga4_property_id);

  const results: { client: string; ym: string; gsc: boolean; ga4: boolean; error?: string }[] = [];
  for (const c of clients) {
    for (const j of jobs) {
      const row: Record<string, unknown> = { client_id: c.id, year_month: j.ym };
      const errs: string[] = [];
      let gscOk = false;
      let ga4Ok = false;
      if (c.gsc_site_url) {
        try {
          row.gsc_snapshot = await fetchGscSnapshot(c.gsc_site_url, j.start, j.end);
          gscOk = true;
        } catch (e) {
          errs.push(`GSC: ${e instanceof Error ? e.message : "실패"}`);
        }
      }
      if (c.ga4_property_id) {
        try {
          row.ga4_snapshot = await fetchGa4Snapshot(c.ga4_property_id, j.start, j.end);
          ga4Ok = true;
        } catch (e) {
          errs.push(`GA4: ${e instanceof Error ? e.message : "실패"}`);
        }
      }
      if (gscOk || ga4Ok) {
        const { error: upErr } = await admin.from("reports").upsert(row, { onConflict: "client_id,year_month" });
        if (upErr) errs.push(`저장: ${upErr.message}`);
      }
      results.push({ client: c.name, ym: j.ym, gsc: gscOk, ga4: ga4Ok, error: errs.length ? errs.join(" · ") : undefined });
    }
  }
  return NextResponse.json({ ok: true, jobs: jobs.map((j) => j.why), clients: clients.length, results });
}
