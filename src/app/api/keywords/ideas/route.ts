import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateKeywordIdeas } from "@/lib/google-ads";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Google Ads 키워드 아이디어 조회. body: { seeds: string[], clientId? } */
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

  if (!process.env.GOOGLE_ADS_REFRESH_TOKEN) {
    return NextResponse.json({
      ok: false,
      error:
        "GOOGLE_ADS_REFRESH_TOKEN이 설정되지 않았습니다. OAuth 리프레시 토큰 발급 후 .env에 입력하세요.",
    });
  }

  try {
    const ideas = await generateKeywordIdeas(seeds);
    await logApiUsage({
      userId: user.id,
      clientId: clientId ?? null,
      provider: "google_ads",
    });
    return NextResponse.json({ ok: true, ideas });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "키워드 조회 실패",
    });
  }
}
