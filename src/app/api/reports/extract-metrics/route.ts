import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAnthropic, GENERATION_MODEL } from "@/lib/anthropic";
import { robustJsonParse } from "@/lib/generation/json";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Extracted {
  blog_total_views?: number;
  blog_visitor_count?: number;
  top_inflow_keywords?: { keyword: string; count: number }[];
}

/**
 * 네이버 통계 스크린샷에서 수치 추출(비전).
 * body: { clientId, imageBase64, mediaType }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, imageBase64, mediaType } = await req.json();
  if (!imageBase64) {
    return NextResponse.json({ ok: false, error: "imageBase64 필수" }, { status: 400 });
  }

  const system = [
    "너는 네이버 블로그 통계 스크린샷에서 수치를 읽어 JSON으로만 출력하는 도구다(코드블록·설명 금지).",
    '형식: { "blog_total_views": 정수, "blog_visitor_count": 정수, "top_inflow_keywords": [{"keyword":"...","count":정수}] }',
    "top_inflow_keywords는 상위 5개까지. 스크린샷에서 확인 불가능한 값은 생략(추측 금지).",
    "숫자의 쉼표·단위는 제거하고 정수로.",
  ].join("\n");

  try {
    const anthropic = createAnthropic();
    const msg = await anthropic.messages
      .stream({
        model: GENERATION_MODEL,
        max_tokens: 1500,
        system,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/png",
                  data: imageBase64,
                },
              },
              { type: "text", text: "이 스크린샷의 수치를 추출해 JSON으로 출력." },
            ],
          },
        ],
      })
      .finalMessage();

    const bt = msg.content.find((b) => b.type === "text");
    const parsed = robustJsonParse<Extracted>(
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

    if (!parsed) {
      return NextResponse.json({ ok: false, error: "추출 실패 (JSON 파싱)" });
    }
    return NextResponse.json({ ok: true, metrics: parsed });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "추출 실패",
    });
  }
}
