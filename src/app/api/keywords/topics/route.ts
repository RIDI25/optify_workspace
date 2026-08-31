import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/llm";
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
  const { data: clientRow } = await supabase
    .from("clients")
    .select("is_internal")
    .eq("id", clientId)
    .single();

  const { system, user: userPrompt } = buildTopicsPrompt({
    channel,
    // 프리셋 미등록 클라이언트도 기본 설정으로 동작 (프리셋 편집 UI 제거됨)
    preset: (settings?.preset ?? {}) as Record<string, unknown>,
    keywords,
    isInternalClient: clientRow?.is_internal ?? false,
  });

  try {
    const msg = await generateText({ system, user: userPrompt, maxTokens: 2000 });

    const parsed = robustJsonParse<string[]>(msg.text);

    await logApiUsage({
      userId: user.id,
      clientId,
      provider: msg.provider,
      model: msg.model,
      inputTokens: msg.inputTokens,
      outputTokens: msg.outputTokens,
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
