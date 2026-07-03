import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchNaverKeywordIdeas } from "@/lib/naver-ads";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 네이버 검색광고 키워드도구 조회. body: { seeds: string[], clientId? } */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { seeds, clientId } = await req.json();
  if (!Array.isArray(seeds) || seeds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "시드 키워드를 입력하세요." },
      { status: 400 },
    );
  }
  if (seeds.filter((s: string) => s?.trim()).length > 5) {
    return NextResponse.json({
      ok: false,
      error: "네이버 키워드도구는 시드를 최대 5개까지 지원합니다.",
    });
  }

  if (!process.env.NAVER_AD_API_KEY) {
    return NextResponse.json({
      ok: false,
      error: "NAVER_AD_API_KEY가 설정되지 않았습니다.",
    });
  }

  try {
    const ideas = await fetchNaverKeywordIdeas(seeds);
    await logApiUsage({
      userId: user.id,
      clientId: clientId ?? null,
      provider: "naver_ads",
    });
    return NextResponse.json({ ok: true, ideas });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "네이버 키워드 조회 실패",
    });
  }
}
