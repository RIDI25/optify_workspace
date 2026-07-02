import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAnthropic, GENERATION_MODEL } from "@/lib/anthropic";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 리포트 AI 총평. body: { clientId, yearMonth, data } (data = 집계/성과 컨텍스트)
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, yearMonth, data } = await req.json();

  const system = [
    "너는 옵티파이의 검색 마케팅 리포트 애널리스트다. 아래 데이터만 근거로 월간 성과 총평을 한국어로 작성한다.",
    "규칙: 주어진 수치만 사용(없는 통계 생성 금지). 4~6문장. 성과 요약 → 눈에 띄는 지표 → 다음 달 제언 순.",
    "과장·홍보 문구 금지, 담백하고 실무적으로. 데이터가 비어 있으면 '데이터 미연동/미입력'으로 명시.",
  ].join("\n");

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
