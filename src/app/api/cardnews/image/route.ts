import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateOpenAiImage, OPENAI_IMAGE_MODEL } from "@/lib/openai";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 카드뉴스 배경 이미지 생성 (OpenAI gpt-image-1) → base64 반환.
 * 텍스트는 클라이언트 캔버스에서 합성하므로 이미지에는 글자 금지.
 * body: { prompt }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { prompt } = (await req.json()) as { prompt?: string };
  if (!prompt?.trim()) {
    return NextResponse.json({ ok: false, error: "prompt 필요" }, { status: 400 });
  }

  const safePrompt = `${prompt}. Abstract minimal flat illustration for a social media card background. Absolutely no text, no letters, no numbers, no logos, no watermarks. Soft, clean, lots of negative space.`;

  try {
    const b64 = await generateOpenAiImage(safePrompt);

    await logApiUsage({
      userId: user.id,
      clientId: null,
      provider: "openai",
      model: OPENAI_IMAGE_MODEL, // 장당 고정 단가로 비용 추정
    });

    return NextResponse.json({ ok: true, dataUrl: `data:image/png;base64,${b64}` });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "이미지 생성 실패",
    });
  }
}
