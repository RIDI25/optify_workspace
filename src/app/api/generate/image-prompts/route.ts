import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAnthropic, GENERATION_MODEL } from "@/lib/anthropic";
import { buildImagePromptsPrompt } from "@/lib/generation/engine";
import { robustJsonParse } from "@/lib/generation/json";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ImagePrompt {
  prompt: string;
  alt_text: string;
  filename: string;
}

/** 본문에서 이미지 생성 프롬프트 배열을 도출. body: { clientId, keyword, body } */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, keyword, body } = await req.json();
  if (!body?.trim()) {
    return NextResponse.json({ ok: false, error: "body 필수" }, { status: 400 });
  }

  // [이미지: …] 마커 수 기준 개수 (1~4), 없으면 3개
  const markers = (body.match(/\[이미지[:：]/g) ?? []).length;
  const count = Math.min(4, Math.max(1, markers || 3));

  const { system, user: userPrompt } = buildImagePromptsPrompt({
    keyword: keyword?.trim() || "",
    body,
    count,
  });

  try {
    const anthropic = createAnthropic();
    const msg = await anthropic.messages
      .stream({
        model: GENERATION_MODEL,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: userPrompt }],
      })
      .finalMessage();

    const bt = msg.content.find((b) => b.type === "text");
    const parsed = robustJsonParse<ImagePrompt[]>(
      bt && bt.type === "text" ? bt.text : "",
    );

    await logApiUsage({
      userId: user.id,
      clientId: clientId ?? null,
      provider: "anthropic",
      model: GENERATION_MODEL,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
    });

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ ok: false, error: "이미지 프롬프트 파싱 실패" });
    }
    return NextResponse.json({ ok: true, image_prompts: parsed.slice(0, count) });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "이미지 프롬프트 생성 실패",
    });
  }
}
