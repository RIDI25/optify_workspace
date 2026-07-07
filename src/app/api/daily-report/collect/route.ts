import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { collectNews } from "@/lib/daily-report/collect";
import { windowHoursKst } from "@/lib/daily-report/generate";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 모니터링 소스 RSS 수집. body 없음. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const result = await collectNews(windowHoursKst());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "수집 실패",
    });
  }
}
