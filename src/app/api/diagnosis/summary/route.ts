import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAnthropic, GENERATION_MODEL } from "@/lib/anthropic";
import { KOREAN_STYLE_BLOCK } from "@/lib/generation/korean-style";
import { logApiUsage } from "@/lib/usage";
import type { DiagnosisResult } from "@/lib/seo-audit/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 진단 결과 → AI 종합 소견 생성·저장. owner 전용.
 * body: { diagnosisId }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "owner") return new NextResponse("Forbidden", { status: 403 });

  const { diagnosisId } = (await req.json()) as { diagnosisId?: string };
  if (!diagnosisId) {
    return NextResponse.json({ ok: false, error: "diagnosisId 필요" }, { status: 400 });
  }

  try {
    const { data: row, error } = await supabase
      .from("seo_diagnoses")
      .select("*")
      .eq("id", diagnosisId)
      .single();
    if (error || !row) throw error ?? new Error("진단을 찾을 수 없습니다.");
    const result = row.results as unknown as DiagnosisResult;

    const digest = result.categories
      .map(
        (cat) =>
          `[${cat.label} ${cat.score ?? "-"}점]\n` +
          cat.checks
            .filter((x) => x.status !== "info" && x.status !== "skip")
            .map((x) => `- (${x.status}) ${x.label}: ${x.detail}`)
            .join("\n"),
      )
      .join("\n\n");

    const system = [
      "너는 옵티파이(부산의 검색 마케팅 회사)의 SEO 컨설턴트다. 진단 데이터를 근거로 사업자(비전문가)가 읽는 종합 소견을 쓴다.",
      "구성: ① 현재 상태 총평 2~3문장 ② 가장 시급한 문제 3가지와 그 문제가 사업에 미치는 영향(방문·문의 관점) ③ 개선 우선순위 제안. 전체 500~800자.",
      "진단 데이터에 있는 사실만 언급한다. 근거 없는 수치·과장 금지. 전문용어는 한 줄로 풀어 쓴다.",
      KOREAN_STYLE_BLOCK,
    ].join("\n\n");
    const userMsg = `사이트: ${result.finalUrl} (종합 ${result.totalScore}점)\n\n${digest}${
      result.crossChecks.length
        ? `\n\n[교차 검증 불일치]\n${result.crossChecks.map((f) => `- ${f.field}: 크롤 "${f.crawler}" vs 현재 "${f.live}"`).join("\n")}`
        : ""
    }`;

    const anthropic = createAnthropic();
    const res = await anthropic.messages.create({
      model: GENERATION_MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    const summary = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();

    await logApiUsage({
      userId: user.id,
      clientId: null,
      provider: "anthropic",
      model: GENERATION_MODEL,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    });

    await supabase.from("seo_diagnoses").update({ ai_summary: summary }).eq("id", diagnosisId);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "소견 생성 실패",
    });
  }
}
