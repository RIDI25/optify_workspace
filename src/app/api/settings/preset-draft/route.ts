import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/llm";
import { buildPresetDraftPrompt } from "@/lib/generation/engine";
import { robustJsonParse } from "@/lib/generation/json";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

interface PresetDraft {
  persona?: string;
  target_reader?: string;
  tone_rules?: string[];
  structure_rules?: string[];
}

/** 채널 프리셋 초안 생성. body: { clientId?, channel, references } (owner 전용 화면에서 호출) */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, channel, references } = await req.json();
  if (!channel || !references) {
    return NextResponse.json(
      { ok: false, error: "channel, references가 필요합니다." },
      { status: 400 },
    );
  }

  const { system, user: userPrompt } = buildPresetDraftPrompt({
    channel,
    references,
  });

  try {
    const msg = await generateText({ system, user: userPrompt, maxTokens: 3000 });

    const parsed = robustJsonParse<PresetDraft>(msg.text);

    await logApiUsage({
      userId: user.id,
      clientId: clientId ?? null,
      provider: msg.provider,
      model: msg.model,
      inputTokens: msg.inputTokens,
      outputTokens: msg.outputTokens,
    });

    if (!parsed?.persona) {
      return NextResponse.json({ ok: false, error: "프리셋 초안 파싱 실패" });
    }
    return NextResponse.json({ ok: true, preset: parsed });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "초안 생성 실패",
    });
  }
}
