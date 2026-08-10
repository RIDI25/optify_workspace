import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createAnthropic,
  GENERATION_MODEL,
  GENERATION_BETAS,
  GENERATION_FALLBACKS,
} from "@/lib/anthropic";
import { KOREAN_STYLE_BLOCK } from "@/lib/generation/korean-style";
import { robustJsonParse } from "@/lib/generation/json";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 월간 플랜 생성용 — 키워드별 콘텐츠 제목 1개씩 일괄 생성.
 * body: { clientId, channel, keywords: string[] }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, channel, keywords } = (await req.json()) as {
    clientId?: string;
    channel?: string;
    keywords?: string[];
  };
  const list = (keywords ?? []).map((k) => k.trim()).filter(Boolean).slice(0, 31);
  if (!list.length) {
    return NextResponse.json({ ok: false, error: "키워드가 필요합니다." }, { status: 400 });
  }

  const system = [
    `너는 검색 마케팅 콘텐츠 기획자다. 각 키워드로 ${channel === "wordpress" ? "워드프레스 블로그" : "네이버 블로그"} 글 제목을 1개씩 만든다.`,
    [
      '[출력 — 유효한 JSON 배열만] [{ "keyword": "...", "title": "..." }] 키워드당 정확히 1개.',
      "- 검색 의도에 답하는 담백한 정보형 제목. 키워드가 자연스럽게 포함될 것.",
      "- 과장·단정('무조건', '충격'), 낚시형 반전, 클릭 유도 상투구 금지.",
      "- 영어 직역 제목 금지: '~에 대한 모든 것', '~하는 방법 5가지', '왜 ~일까요?' 류.",
    ].join("\n"),
    KOREAN_STYLE_BLOCK,
  ].join("\n\n");

  try {
    const anthropic = createAnthropic();
    const res = await anthropic.beta.messages.create({
      model: GENERATION_MODEL,
      betas: GENERATION_BETAS,
      fallbacks: GENERATION_FALLBACKS,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: `키워드:\n${list.map((k) => `- ${k}`).join("\n")}` }],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    const titles = robustJsonParse<{ keyword: string; title: string }[]>(text) ?? [];

    await logApiUsage({
      userId: user.id,
      clientId: clientId ?? null,
      provider: "anthropic",
      model: GENERATION_MODEL,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    });

    return NextResponse.json({ ok: true, titles });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "제목 생성 실패",
    });
  }
}
