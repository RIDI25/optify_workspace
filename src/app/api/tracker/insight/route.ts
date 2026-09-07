import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GENERATION_BETAS, GENERATION_FALLBACKS, REASONING_MODEL, createAnthropic } from "@/lib/anthropic";
import { logApiUsage } from "@/lib/usage";
import { loadRunBundle } from "@/lib/tracker-server/load-run";
import { pct } from "@/lib/tracker-digest";
import { metricLabel, surfaceLabel } from "@/lib/tracker";
import type { TrackingScope } from "@/components/tracking/tracking-view";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 측정 결과 추론 — Claude Fable(REASONING_MODEL) 이 한 번의 측정을 고객사 보고용으로 해석한다.
 * body: { clientId, scope: 'geo'|'seo', runId? } → tracker_insights 에 저장하고 본문을 돌려준다.
 * 자료에 있는 숫자만 쓰도록 시스템 프롬프트에서 묶는다.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: me } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!me) return new NextResponse("Forbidden", { status: 403 });

  const { clientId, scope, runId } = (await req.json()) as { clientId?: string; scope?: TrackingScope; runId?: string | null };
  if (!clientId || (scope !== "geo" && scope !== "seo")) {
    return NextResponse.json({ ok: false, error: "clientId, scope(geo|seo) 필요" }, { status: 400 });
  }
  const bundle = await loadRunBundle(supabase, clientId, scope, runId);
  if ("error" in bundle) return NextResponse.json({ ok: false, error: bundle.error }, { status: 404 });

  // ── 자료 다이제스트 (모델에 넘기는 전부) ──
  const d = bundle.digest;
  const lines: string[] = [];
  lines.push(`고객사: ${bundle.client.name}`);
  lines.push(`측정: ${bundle.run.run_id} · ${bundle.run.started_at ?? ""} · 표면 ${bundle.run.surfaces.map(surfaceLabel).join(", ")}`);
  if (bundle.prevRun) lines.push(`직전 측정: ${bundle.prevRun.run_id} · ${bundle.prevRun.started_at ?? ""}`);
  if (d.kind === "geo") {
    lines.push("", "[표면별] 표면 | 관측 | AI 답변 노출 | 우리 언급 | 우리 인용 | 노출률 | 언급률 | 인용률");
    for (const s of d.surfaces) lines.push(`${surfaceLabel(s.surface)} | ${s.observed} | ${s.present} | ${s.mention} | ${s.citation} | ${pct(s.presentRate)} | ${pct(s.mentionRate)} | ${pct(s.citationRate)}`);
    lines.push("", "[질문별] 질문(의도) → 표면: 노출/언급/인용, 언급된 경쟁사");
    for (const p of d.prompts) {
      const cells = Object.entries(p.cells).map(([s, c]) => `${surfaceLabel(s)}: ${c.error ? `오류(${c.error})` : `${c.present ? "노출" : "미노출"}/${c.mention ? "언급" : "언급없음"}/${c.citation ? "인용" : "인용없음"}`}${c.competitors.length ? ` 경쟁사 ${c.competitors.join(",")}` : ""}`);
      lines.push(`- ${p.text} (${p.intent}) → ${cells.join(" · ")}`);
    }
    if (d.competitorMentions.length) lines.push("", "[경쟁사 언급 횟수] " + d.competitorMentions.map(([n, c]) => `${n} ${c}`).join(", "));
    if (d.topDomains.length) lines.push("[많이 인용된 도메인] " + d.topDomains.map(([n, c]) => `${n} ${c}`).join(", "));
  } else {
    lines.push("", "[표면별] 표면 | 검색어 수 | 노출된 검색어 | 3위 안 | 10위 안 | 평균 최고 순위");
    for (const s of d.surfaces) lines.push(`${surfaceLabel(s.surface)} | ${s.keywords} | ${s.found} | ${s.top3} | ${s.top10} | ${s.avgBest == null ? "-" : s.avgBest.toFixed(1)}`);
    lines.push("", "[검색어별] 검색어(의도) → 표면: 순위(영역 내 순위)");
    for (const k of d.keywords) {
      const cells = Object.entries(k.cells).map(([s, c]) => `${surfaceLabel(s)}: ${c.error ? `오류` : c.best != null ? `${c.best}위(${c.section ?? ""} ${c.sectionRank ?? ""}위)` : "없음"}`);
      lines.push(`- ${k.text} (${k.intent}) → ${cells.join(" · ")}`);
    }
  }
  if (bundle.changes.length) lines.push("", "[직전 측정 대비 변화]", ...bundle.changes.map((c) => `- ${c}`));
  if (bundle.weekly.length) {
    lines.push("", "[최근 주간 지표] 주 | 표면 | 지표 | 값");
    for (const w of bundle.weekly) lines.push(`${w.week} | ${surfaceLabel(w.surface)} | ${metricLabel(w.metric)} | ${w.value == null ? "-" : w.metric === "rank_avg_best_position" ? w.value.toFixed(1) : pct(w.value)}`);
  }
  if (bundle.tc?.competitors.length) lines.push("", `[등록된 경쟁사] ${bundle.tc.competitors.join(", ")}`);

  const system = [
    "너는 옵티파이(검색 마케팅 회사)의 분석가다. 아래 측정 자료만 근거로, 고객사 대표가 읽을 보고 문장을 한국어로 쓴다.",
    "규칙: 자료에 없는 숫자·사실을 지어내지 않는다. 확인할 수 없으면 '자료 없음'이라고 쓴다. 과장·추정 금지. 노출 증가를 문의 증가로 단정하지 않는다.",
    "구성(마크다운, 제목은 ## 로): ## 한 줄 요약 / ## 이번 측정에서 보인 것 (3~5개 불릿, 숫자 포함) / ## 지난 측정 대비 변화 (없으면 '첫 측정이라 비교 없음') / ## 경쟁사·출처에서 읽히는 것 / ## 다음 조치 제안 (실행 가능한 것 3개, 각 1~2문장).",
    "문체: '~합니다/~입니다' 기본, 짧은 문장, 전문 용어는 풀어 쓴다. 전체 500~900자.",
    scope === "geo"
      ? "용어: 노출 = AI 답변 블록이 떴는가, 언급 = 답변 본문에 우리 이름이 있는가, 인용 = 출처에 우리 매체가 있는가."
      : "용어: 순위 = 검색 결과 화면에 보이는 순서(광고·플레이스 포함), 괄호 안은 영역 안 순서. '없음' = 첫 화면에 우리 매체가 없음.",
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
      messages: [{ role: "user", content: `측정 자료:\n\n${lines.join("\n")}` }],
    });
    text = res.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n")
      .trim();
    model = res.model ?? REASONING_MODEL;
    inputTokens = res.usage?.input_tokens ?? 0;
    outputTokens = res.usage?.output_tokens ?? 0;
    if (res.stop_reason === "refusal" || !text) {
      return NextResponse.json({ ok: false, error: "모델이 이 요청에 답하지 않았습니다. 잠시 뒤 다시 시도하세요." }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "추론 실패" }, { status: 502 });
  }

  await logApiUsage({ userId: user.id, clientId, provider: "anthropic", model, inputTokens, outputTokens });
  const { data: saved, error } = await supabase
    .from("tracker_insights")
    .insert({ client_id: clientId, scope, run_id: bundle.run.run_id, model, insight: text, input_tokens: inputTokens, output_tokens: outputTokens, created_by: user.id })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: true, insight: text, model, saved: false, warning: `저장 실패(0030 실행 여부 확인): ${error.message}` });
  }
  return NextResponse.json({ ok: true, insight: text, model, saved: true, row: saved });
}
