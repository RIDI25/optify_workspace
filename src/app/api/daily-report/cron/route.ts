import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { GENERATION_MODEL } from "@/lib/anthropic";
import { collectNews } from "@/lib/daily-report/collect";
import {
  generateDailyReportContent,
  kstToday,
  windowHoursKst,
} from "@/lib/daily-report/generate";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 매일 아침 자동 생성 (Vercel Cron — vercel.json 참조).
 * 인증: Authorization: Bearer ${CRON_SECRET} (Vercel이 자동 첨부).
 * 이미 오늘 리포트가 있으면 건너뛴다(수동 생성분 보존 + 중복 비용 방지).
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

  const date = kstToday();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("daily_reports")
    .select("id, report")
    .eq("report_date", date)
    .maybeSingle();
  if (existing?.report) {
    return NextResponse.json({ ok: true, skipped: true, date });
  }

  try {
    const collected = await collectNews(windowHoursKst());
    if (collected.items.length === 0) {
      // 조용한 날 — 수집 스냅샷만 남긴다 (리포트 없음으로 표시됨)
      await admin
        .from("daily_reports")
        .upsert({ report_date: date, collected, report: null }, { onConflict: "report_date" });
      return NextResponse.json({ ok: true, date, items: 0 });
    }

    const { report, inputTokens, outputTokens } =
      await generateDailyReportContent(date, collected);

    await logApiUsage({
      userId: null,
      clientId: null,
      provider: "anthropic",
      model: GENERATION_MODEL,
      inputTokens,
      outputTokens,
    });

    const { error } = await admin
      .from("daily_reports")
      .upsert({ report_date: date, collected, report }, { onConflict: "report_date" });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, date, items: collected.items.length });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "cron 생성 실패" },
      { status: 500 },
    );
  }
}
