import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GENERATION_MODEL } from "@/lib/anthropic";
import { generateDailyReportContent } from "@/lib/daily-report/generate";
import { logApiUsage } from "@/lib/usage";
import type { CollectResult } from "@/lib/daily-report/collect";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 수집 아이템 → 데일리 리포트 생성 + 저장 (수동 버튼용).
 * body: { date: 'YYYY-MM-DD', collected: CollectResult }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { date, collected } = (await req.json()) as {
    date?: string;
    collected?: CollectResult;
  };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { ok: false, error: "date('YYYY-MM-DD')가 필요합니다." },
      { status: 400 },
    );
  }
  if (!collected || collected.items.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "수집된 소식이 없습니다. 조용한 날이거나 피드 수집에 실패했어요.",
    });
  }

  try {
    const { report, inputTokens, outputTokens } =
      await generateDailyReportContent(date, collected);

    await logApiUsage({
      userId: user.id,
      clientId: null,
      provider: "anthropic",
      model: GENERATION_MODEL,
      inputTokens,
      outputTokens,
    });

    const { error } = await supabase.from("daily_reports").upsert(
      { report_date: date, collected, report },
      { onConflict: "report_date" },
    );
    if (error) {
      // 0009 마이그레이션 미실행 등 — 리포트는 반환하되 저장 실패 안내
      return NextResponse.json({
        ok: true,
        report,
        warning: `저장 실패(리포트는 표시됨): ${error.message} — supabase/migrations/0009 실행 여부를 확인하세요.`,
      });
    }
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "리포트 생성 실패",
    });
  }
}
