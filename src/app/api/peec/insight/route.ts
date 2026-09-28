import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GENERATION_BETAS, GENERATION_FALLBACKS, REASONING_MODEL, createAnthropic } from "@/lib/anthropic";
import { logApiUsage } from "@/lib/usage";
import { peecDigest } from "@/lib/peec";
import { clampDays, loadPeecSummary, peecRunId } from "@/lib/peec-server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Peec 결과 추론 — Claude Fable(REASONING_MODEL). body: { clientId, days } → tracker_insights(scope geo, run_id peec:기간) */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { clientId, days } = (await req.json()) as { clientId?: string; days?: number };
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId 필요" }, { status: 400 });
  const r = await loadPeecSummary(supabase, clientId, clampDays(days));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });

  const system = [
    "너는 옵티파이(검색·AI 노출 전략 회사)의 분석가다. 아래 측정 자료만 근거로, 고객사 대표가 읽을 보고 문장을 한국어로 쓴다.",
    "규칙: 자료에 없는 숫자·사실을 지어내지 않는다. 확인할 수 없으면 '자료 없음'이라고 쓴다. 과장·추정 금지. 노출 증가를 문의 증가로 단정하지 않는다.",
    "용어: 노출률 = AI 답변 가운데 우리 브랜드가 나온 비율, 평균 순위 = 답변 안에서 우리가 몇 번째로 나왔나, 인용 출처 = AI 가 근거로 든 사이트.",
    "구성(마크다운, 제목은 ## 로): ## 한 줄 요약 / ## 이번 기간에 보인 것 (3~5개 불릿, 숫자 포함) / ## 채널별로 읽히는 것 / ## 비어 있는 질문과 출처에서 읽히는 것 / ## 다음 조치 제안 (실행 가능한 것 3개, 각 1~2문장, 어떤 콘텐츠·페이지·출처를 손볼지).",
    "문체: '~합니다/~입니다' 기본, 짧은 문장, 전문 용어는 풀어 쓴다. 전체 600~1000자.",
  ].join("\n");

  const anthropic = createAnthropic();
  let text = "";
  let model = REASONING_MODEL;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const res = await anthropic.beta.messages.create({
      model: REASONING_MODEL,
      betas: GENERATION_BETAS,
      fallbacks: GENERATION_FALLBACKS,
      max_tokens: 2500,
      system,
      messages: [{ role: "user", content: `측정 자료:\n\n${peecDigest(r.summary, r.client.name)}` }],
    });
    text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    model = res.model ?? REASONING_MODEL;
    inputTokens = res.usage?.input_tokens ?? 0;
    outputTokens = res.usage?.output_tokens ?? 0;
    if (res.stop_reason === "refusal" || !text) return NextResponse.json({ ok: false, error: "모델이 답하지 않았습니다. 잠시 뒤 다시 시도하세요." }, { status: 502 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "추론 실패";
    return NextResponse.json({ ok: false, error: /credit balance/i.test(msg) ? "Anthropic API 크레딧이 부족합니다. console.anthropic.com 에서 충전한 뒤 다시 누르세요." : msg }, { status: 502 });
  }

  await logApiUsage({ userId: user.id, clientId, provider: "anthropic", model, inputTokens, outputTokens });
  const { error } = await supabase.from("tracker_insights").insert({
    client_id: clientId, scope: "geo", run_id: peecRunId(r.summary.period), model, insight: text,
    input_tokens: inputTokens, output_tokens: outputTokens, created_by: user.id,
  });
  return NextResponse.json({ ok: true, insight: { insight: text, model, created_at: new Date().toISOString() }, saved: !error, warning: error ? `저장 실패: ${error.message}` : undefined });
}
