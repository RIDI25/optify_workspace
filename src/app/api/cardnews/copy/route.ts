import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAnthropic, GENERATION_MODEL } from "@/lib/anthropic";
import { KOREAN_STYLE_BLOCK } from "@/lib/generation/korean-style";
import { robustJsonParse } from "@/lib/generation/json";
import { logApiUsage } from "@/lib/usage";
import type { DailyReportContent } from "@/types/daily-report";

export const runtime = "nodejs";
export const maxDuration = 120;

export interface CardCopy {
  type: "cover" | "content" | "outro";
  title: string;
  lines: string[];
  /** 배경 일러스트 영문 프롬프트 (텍스트 없는 추상 배경) */
  image_prompt: string;
}

/**
 * 데일리 리포트 → 카드뉴스 카피(JSON) 생성. 팀 멤버 사용 가능.
 * body: { reportDate: 'YYYY-MM-DD' }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { reportDate } = (await req.json()) as { reportDate?: string };
  if (!reportDate) {
    return NextResponse.json({ ok: false, error: "reportDate 필요" }, { status: 400 });
  }

  try {
    const { data: row, error } = await supabase
      .from("daily_reports")
      .select("report")
      .eq("report_date", reportDate)
      .maybeSingle();
    if (error) throw error;
    const report = row?.report as DailyReportContent | null;
    if (!report) throw new Error("해당 날짜의 데일리 리포트가 없습니다.");

    const system = [
      "너는 검색·AI 마케팅 분야 전문 뉴스레터의 에디터다. 데일리 리포트에서 사업자 독자에게 의미 있는 소식을 골라, 업계 브리핑 형식의 카드뉴스 카피를 만든다.",
      [
        "[출력 — 유효한 JSON 배열만, 코드블록·설명 금지]",
        '[{ "type": "cover"|"content"|"outro", "title": "…", "lines": ["…"], "image_prompt": "…" }]',
        "- 총 5~7장: cover 1장 + content 3~5장 + outro 1장.",
        "- cover: 오늘 소식들을 정확히 요약하는 저널 스타일 헤드라인(18자 내외) + lines 1줄(다루는 범위 부제). 훅·궁금증 유발형 제목 금지.",
        "- content: 소식 1건당 1장. title은 사실 중심의 짧은 제목(20자 내외), lines는 2~3줄 — 한 줄당 28자 이내. 1줄차: 무엇이 바뀌었는지(사실), 2~3줄차: 맥락과 시사점.",
        "- outro: 오늘 소식들을 관통하는 시사점 한 줄 정리 + 이어서 볼 만한 관점 1줄. 홍보·구독 유도 멘트 금지.",
        "",
        "[톤 — 전문 브리핑]",
        "- 정보 전달이 목적이다. 감탄사·느낌표·이모지·과장 금지.",
        '- 홍보·클릭 유도 표현 금지: "꼭 확인하세요", "놓치면 안 됩니다", "지금 바로", "주목!" 류.',
        "- 발표·수치·변경 사항 같은 확인된 사실은 담백하게 서술한다.",
        '- 해석·전망·영향은 단정하지 않는다: "~로 보입니다", "~할 가능성이 있습니다", "~을 시사합니다", "지켜볼 대목입니다" 같은 신중한 서술을 쓴다. (아래 어투 규칙의 "단정으로" 지침보다 이 항목이 우선)',
        "- 다만 모든 문장을 추측조로 흐리지는 않는다 — 사실은 사실대로, 해석만 신중하게.",
        "- 근거 없는 수치 생성 금지. 리포트에 있는 사실만.",
        "- image_prompt: 각 카드 배경용 영문 프롬프트. abstract minimal flat illustration, 해당 카드 주제의 시각적 은유, soft mint green (#00E87B accent) and white palette, generous negative space, no text no letters no logos. 카드마다 장면을 다르게.",
      ].join("\n"),
      KOREAN_STYLE_BLOCK,
    ].join("\n\n");

    const userMsg = [
      `[헤드라인]\n${report.headlines.map((h) => `- ${h}`).join("\n")}`,
      `[소식 상세]\n${report.stories
        .map((story) => `- ${story.title}\n  변화: ${story.what}\n  영향: ${story.impact}`)
        .join("\n")}`,
    ].join("\n\n");

    const anthropic = createAnthropic();
    const res = await anthropic.messages.create({
      model: GENERATION_MODEL,
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    const cards = robustJsonParse<CardCopy[]>(text);
    if (!cards || !Array.isArray(cards) || !cards.length) {
      throw new Error("카드 카피 파싱 실패 — 다시 시도해 주세요.");
    }

    await logApiUsage({
      userId: user.id,
      clientId: null,
      provider: "anthropic",
      model: GENERATION_MODEL,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    });

    return NextResponse.json({ ok: true, cards });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "카드 카피 생성 실패",
    });
  }
}
