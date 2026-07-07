import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAnthropic, GENERATION_MODEL } from "@/lib/anthropic";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

const COMMON_RULES = [
  "규칙: 주어진 수치만 사용(없는 통계 생성 금지). 과장·홍보 문구 금지, 담백하고 실무적으로.",
  "데이터가 비어 있으면 '데이터 미연동/미입력'으로 명시.",
].join("\n");

const SCOPE_SYSTEMS: Record<string, string> = {
  google: [
    "너는 옵티파이의 검색 마케팅 리포트 애널리스트다. 아래 GSC(구글 서치콘솔)·GA4 데이터만 근거로 이번 달 구글 성과 리포트를 한국어로 작성한다.",
    "구성: ① 검색 성과 요약(클릭·노출·CTR·평균순위) ② 일별 추이에서 보이는 흐름 ③ 상위 쿼리·페이지에서 눈에 띄는 점 ④ 유입 채널·사용자 행동(GA4) ⑤ 다음 달 개선 제언 1~2개.",
    "6~10문장, 문단 구분.",
    COMMON_RULES,
  ].join("\n"),
  naver: [
    "너는 옵티파이의 검색 마케팅 리포트 애널리스트다. 아래 네이버 블로그 성과 데이터만 근거로 이번 달 네이버 성과 리포트를 한국어로 작성한다.",
    "구성: ① 조회수·방문자 요약 ② 상위 유입 키워드에서 보이는 점 ③ (월별 추이가 있으면) 전월 대비 흐름 ④ 다음 달 제언 1~2개.",
    "4~7문장, 문단 구분.",
    COMMON_RULES,
  ].join("\n"),
  overall: [
    "너는 옵티파이의 검색 마케팅 리포트 애널리스트다. 아래에 구글 리포트·네이버 리포트 텍스트와 콘텐츠 집계가 주어진다. 이를 종합해 이번 달 종합 리포트를 한국어로 작성한다.",
    "구성: ① 이번 달 핵심 성과 한 줄 ② 구글 성과 요약 ③ 네이버 성과 요약 ④ 콘텐츠 운영(생성·발행) ⑤ 다음 달 방향 제언 2~3개.",
    "6~10문장, 문단 구분. 두 채널을 비교·연결하는 관점을 담되 수치는 주어진 것만.",
    COMMON_RULES,
  ].join("\n"),
};

/**
 * 리포트 AI 생성. body: { clientId, yearMonth, data, scope? }
 * scope: 'google' | 'naver' | 'overall' (기본 overall) — 섹션별 리포트 프롬프트 분기
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, yearMonth, data, scope } = await req.json();

  const system = SCOPE_SYSTEMS[scope as string] ?? SCOPE_SYSTEMS.overall;

  const user_ = `클라이언트 기간: ${yearMonth}\n\n데이터(JSON):\n${JSON.stringify(data, null, 2)}`;

  try {
    const anthropic = createAnthropic();
    const msg = await anthropic.messages
      .stream({
        model: GENERATION_MODEL,
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: user_ }],
      })
      .finalMessage();

    const bt = msg.content.find((b) => b.type === "text");
    const summary = bt && bt.type === "text" ? bt.text.trim() : "";

    await logApiUsage({
      userId: user.id,
      clientId: clientId ?? null,
      provider: "anthropic",
      model: GENERATION_MODEL,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "총평 생성 실패",
    });
  }
}
