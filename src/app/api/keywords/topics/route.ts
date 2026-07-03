import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAnthropic, GENERATION_MODEL } from "@/lib/anthropic";
import { buildTopicsPrompt } from "@/lib/generation/engine";
import { robustJsonParse } from "@/lib/generation/json";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 선택 키워드 → 채널별 주제(제목안) 5~10개. body: { clientId, channel, keywords: string[] } */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, channel, keywords } = await req.json();
  if (!clientId || !channel || !Array.isArray(keywords) || keywords.length === 0) {
    return NextResponse.json(
      { ok: false, error: "clientId, channel, keywords가 필요합니다." },
      { status: 400 },
    );
  }

  const { data: settings } = await supabase
    .from("channel_settings")
    .select("preset")
    .eq("client_id", clientId)
    .eq("channel", channel)
    .single();
  if (!settings) {
    return NextResponse.json({ ok: false, error: "채널 프리셋이 없습니다." });
  }

  const { system, user: userPrompt } = buildTopicsPrompt({
    channel,
    preset: settings.preset as Record<string, unknown>,
    keywords,
  });

  try {
    const anthropic = createAnthropic();
    const msg = await anthropic.messages
      .stream({
        model: GENERATION_MODEL,
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: userPrompt }],
      })
      .finalMessage();

    const bt = msg.content.find((b) => b.type === "text");
    const parsed = robustJsonParse<string[]>(
      bt && bt.type === "text" ? bt.text : "",
    );

    await logApiUsage({
      userId: user.id,
      clientId,
      provider: "anthropic",
      model: GENERATION_MODEL,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
    });

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ ok: false, error: "주제 파싱 실패" });
    }
    // 문자열/객체 혼재 대비
    const topics = parsed
      .map((t) =>
        typeof t === "string" ? t : String((t as { title?: string })?.title ?? ""),
      )
      .filter(Boolean)
      .slice(0, 10);
    return NextResponse.json({ ok: true, topics });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "주제 생성 실패",
    });
  }
}
