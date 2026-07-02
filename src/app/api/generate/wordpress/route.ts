import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAnthropic, GENERATION_MODEL } from "@/lib/anthropic";
import { buildWordpressJsonPrompt } from "@/lib/generation/engine";
import { robustJsonParse } from "@/lib/generation/json";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 300;

interface WpJson {
  content_html: string;
  meta_description: string;
  slug: string;
  faq: { question: string; answer: string }[];
  image_prompts: { prompt: string; alt_text: string; filename: string }[];
}

const MIN_CHARS = 3000;

/** 태그 제외 본문 글자 수 (패널 표시와 동일 기준) */
function textLen(html: string): number {
  return html.replace(/<[^>]+>/g, "").length;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, topic, keyword, extraInstructions, planId } =
    await req.json();
  if (!clientId || !topic?.trim()) {
    return NextResponse.json(
      { ok: false, error: "clientId, topic는 필수입니다." },
      { status: 400 },
    );
  }

  const { data: settings } = await supabase
    .from("channel_settings")
    .select("preset")
    .eq("client_id", clientId)
    .eq("channel", "wordpress")
    .single();
  if (!settings) {
    return NextResponse.json(
      { ok: false, error: "워드프레스 프리셋이 없습니다." },
      { status: 404 },
    );
  }

  // 글 길이 기준 이미지 3~4장 (롱폼 기본 4장)
  const imageCount = 4;
  const { system, user: userPrompt } = buildWordpressJsonPrompt({
    preset: settings.preset as Record<string, unknown>,
    topic,
    keyword: keyword?.trim() || topic.trim(),
    extraInstructions,
    imageCount,
  });

  try {
    const anthropic = createAnthropic();
    // 큰 max_tokens는 non-streaming 시 SDK의 10분 타임아웃 가드에 걸리므로 스트리밍 사용.
    // 청크는 SDK가 누적하고, finalMessage()로 완성 메시지를 받아 JSON을 파싱한다.
    const msg = await anthropic.messages
      .stream({
        model: GENERATION_MODEL,
        max_tokens: 32000,
        system,
        messages: [{ role: "user", content: userPrompt }],
      })
      .finalMessage();

    const textBlock = msg.content.find((b) => b.type === "text");
    const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";
    let parsed = robustJsonParse<WpJson>(rawText);

    // 재시도: 유효 JSON으로 다시 작성 요청
    if (!parsed) {
      const retry = await anthropic.messages
        .stream({
          model: GENERATION_MODEL,
          max_tokens: 32000,
          system:
            "당신은 잘못된 JSON을 고치는 도우미입니다. 입력을 유효한 JSON으로만 다시 출력하세요. 다른 텍스트 금지.",
          messages: [
            { role: "user", content: `유효한 JSON으로 다시 출력:\n\n${rawText}` },
          ],
        })
        .finalMessage();
      const rb = retry.content.find((b) => b.type === "text");
      parsed = robustJsonParse<WpJson>(rb && rb.type === "text" ? rb.text : "");
    }

    if (!parsed?.content_html) {
      return NextResponse.json({
        ok: false,
        error: "AI 응답 JSON 파싱에 실패했습니다. 다시 시도해주세요.",
      });
    }

    let inputTokens = msg.usage.input_tokens;
    let outputTokens = msg.usage.output_tokens;

    // 분량 보강 패스: 3,000자 미만이면 부족한 섹션을 확장(1회)
    if (textLen(parsed.content_html) < MIN_CHARS) {
      const boost = await anthropic.messages
        .stream({
          model: GENERATION_MODEL,
          max_tokens: 32000,
          system:
            "너는 옵티파이의 SEO 편집자. 주어진 HTML 블로그 본문에서 분량이 얕은 H2 섹션을 각 400~600자 이상으로 확장해 전체를 3,000자 이상으로 보강하라. 기존 구조·소제목·주제를 유지하고 문단·예시·설명을 덧붙여 자연스럽게 늘린다. 없는 통계·수치는 만들지 말 것. 확장된 전체 HTML만 출력(코드블록·설명 문구 금지).",
          messages: [
            {
              role: "user",
              content: `현재 본문 글자 수 약 ${textLen(parsed.content_html)}자. 3,000자 이상으로 확장한 전체 HTML을 출력:\n\n${parsed.content_html}`,
            },
          ],
        })
        .finalMessage();
      const bt = boost.content.find((b) => b.type === "text");
      const expanded =
        bt && bt.type === "text"
          ? bt.text.replace(/```(?:html)?/g, "").trim()
          : "";
      inputTokens += boost.usage.input_tokens;
      outputTokens += boost.usage.output_tokens;
      if (textLen(expanded) > textLen(parsed.content_html)) {
        parsed.content_html = expanded;
      }
    }

    // 초기 저장 (이미지 삽입 전 content_html)
    const { data: inserted } = await supabase
      .from("contents")
      .insert({
        client_id: clientId,
        plan_id: planId ?? null,
        channel: "wordpress",
        title: topic.trim().slice(0, 120),
        body: parsed.content_html,
        model: GENERATION_MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (planId) {
      await supabase
        .from("content_plans")
        .update({ status: "review" })
        .eq("id", planId);
    }

    await logApiUsage({
      userId: user.id,
      clientId,
      provider: "anthropic",
      model: GENERATION_MODEL,
      inputTokens,
      outputTokens,
    });

    return NextResponse.json({
      ok: true,
      contentId: inserted?.id ?? null,
      content_html: parsed.content_html,
      meta_description: parsed.meta_description ?? "",
      slug: parsed.slug ?? "",
      faq: parsed.faq ?? [],
      image_prompts: (parsed.image_prompts ?? []).slice(0, imageCount),
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "생성 실패",
    });
  }
}
