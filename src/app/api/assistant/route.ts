import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAnthropic } from "@/lib/anthropic";
import { ASSISTANT_TOOLS, executeAssistantTool } from "@/lib/assistant/tools";
import { logApiUsage } from "@/lib/usage";
import type Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 비서 챗봇 전용 모델 — 도구 호출 정확도 우선 (글쓰기 프로바이더 전환과 무관) */
const ASSISTANT_MODEL = "claude-opus-5";
const MAX_TOOL_ROUNDS = 6;

function kstToday(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function buildSystem(role: string): string {
  return [
    "너는 '옵티파이 워크스페이스'(B2B SEO/GEO 마케팅 회사의 내부 업무 툴)의 비서다. 사용자의 자연어 요청을 도구로 실행해 데이터를 등록·조회한다.",
    `오늘 날짜(KST): ${kstToday()} · 사용자 역할: ${role}`,
    "",
    "[규칙]",
    "- 금액 변환: '550만원'=5500000, '1억'=100000000, '30만'=300000. 원 단위 정수로 도구에 전달.",
    "- 세금계산서 금액: 사용자가 '부가세 포함/합계'라고 명시하지 않으면 언급 금액을 공급가액으로 보고 부가세 10%를 자동 계산한다. '포함'이면 합계÷1.1을 공급가로 역산해 전달하고, 등록 후 어떻게 해석했는지 한 줄로 밝힌다.",
    "- 필수 정보(거래처명, 금액 등)가 없으면 도구를 호출하지 말고 짧게 되묻는다. 추측으로 등록하지 않는다.",
    "- 입금 등록은 반드시 list_tax_invoices로 대상을 찾은 뒤 진행한다. 같은 거래처 건이 여러 개면 어떤 건인지 되묻는다.",
    "- 입금 등록에 선금/잔금 구분은 없다 — 금액·날짜만 등록하면 미수금이 자동 계산된다. 사용자가 '선금/잔금'이라고 말해도 되묻지 말고 금액만 등록한다 (필요하면 메모에 남긴다).",
    "- 담당자 지정: '동생'/'직원' → assignee 'member', '나'/'내가 할게' → 'me'. 언급 없으면 업무는 'me'.",
    "- 마감·일정의 자연어 날짜('금요일까지', '다음 주 초', '수요일 2시')는 오늘(KST) 기준 YYYY-MM-DD(시간은 HH:MM 24시간제)로 변환해 전달한다. '다음 주 초'처럼 애매하면 해석한 날짜를 답변에서 밝힌다.",
    "- 업무 상태 변경은 반드시 list_tasks로 대상 id를 확인한 뒤 update_task_status를 호출한다. 같은 이름의 업무가 여러 개면 되묻는다.",
    "- 일정 조회 기본 범위는 오늘부터 7일. '다음 주'는 다음 주 월~일.",
    "- 완료 후 등록된 내용을 한두 문장으로 요약 보고한다 (금액은 천 단위 쉼표).",
    "- 권한 오류(owner 전용)가 나면 그대로 안내한다.",
    "- 도구 범위 밖 요청(콘텐츠 생성, 견적서 작성 등)은 해당 메뉴를 안내한다: 콘텐츠 생성 → '콘텐츠 생성' 메뉴, 견적서 → '견적서' 메뉴, 진단 → 'SEO 진단' 메뉴, 업무 보드 → '업무' 메뉴, 캘린더 → '스케줄' 메뉴.",
    "- 답변은 한국어로 짧고 담백하게. 이모지·과장 금지.",
  ].join("\n");
}

/**
 * 워크스페이스 비서 — 자연어 → 도구 실행 (수동 tool-use 루프).
 * body: { messages: { role: "user"|"assistant"; content: string }[] }
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
  if (!profile) return new NextResponse("Forbidden", { status: 403 }); // 팀원만 [코덱스 2차 ④]

  const { messages } = (await req.json()) as {
    messages?: { role: "user" | "assistant"; content: string }[];
  };
  if (!messages?.length) {
    return NextResponse.json({ ok: false, error: "messages 필요" }, { status: 400 });
  }

  const history: Anthropic.MessageParam[] = messages
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));

  const anthropic = createAnthropic();
  const actions: { name: string; ok: boolean; summary: string }[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    let response = await anthropic.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 2000,
      system: buildSystem(profile?.role ?? "member"),
      tools: ASSISTANT_TOOLS,
      messages: history,
    });
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    let rounds = 0;
    while (response.stop_reason === "tool_use" && rounds < MAX_TOOL_ROUNDS) {
      rounds += 1;
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      // 스레드 유지: thinking 블록 포함 전체 content를 그대로 되돌려준다
      history.push({ role: "assistant", content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const r = await executeAssistantTool(
          supabase,
          tu.name,
          (tu.input ?? {}) as Record<string, unknown>,
          { userId: user.id },
        );
        actions.push({ name: tu.name, ok: r.ok, summary: r.result });
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: r.result,
          is_error: !r.ok,
        });
      }
      history.push({ role: "user", content: results });

      response = await anthropic.messages.create({
        model: ASSISTANT_MODEL,
        max_tokens: 2000,
        system: buildSystem(profile?.role ?? "member"),
        tools: ASSISTANT_TOOLS,
        messages: history,
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
    }

    if (response.stop_reason === "refusal") {
      return NextResponse.json({
        ok: true,
        text: "요청을 처리할 수 없습니다. 다르게 표현해 주세요.",
        actions,
      });
    }

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();

    await logApiUsage({
      userId: user.id,
      clientId: null,
      provider: "anthropic",
      model: ASSISTANT_MODEL,
      inputTokens,
      outputTokens,
    });

    return NextResponse.json({ ok: true, text: text || "처리했습니다.", actions });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "비서 처리 실패",
      actions,
    });
  }
}
