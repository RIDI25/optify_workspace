import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { collectNews } from "@/lib/daily-report/collect";

export const runtime = "nodejs";
export const maxDuration = 60;

/** KST 기준 월요일이면 72시간(주말 소식 포함), 아니면 48시간 */
function windowHoursKst(): number {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.getUTCDay() === 1 ? 72 : 48;
}

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
