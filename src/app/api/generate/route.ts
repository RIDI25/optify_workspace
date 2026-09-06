import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { streamText, currentGenerationModel, generationProvider } from "@/lib/llm";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/generation/engine";
import { logApiUsage } from "@/lib/usage";
import { approvalFieldsForCreator } from "@/lib/approval";
import {
  getNaverCategory,
  matchNaverCategoryByLabel,
  NAVER_CATEGORY_MARKER_RE,
} from "@/lib/naver-categories";
import {
  META_DELIMITER,
  type StreamMeta,
} from "@/lib/generation/stream-protocol";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  clientId: string;
  channel: string;
  contentType?: string | null;
  topic: string;
  extraInstructions?: string;
  planId?: string | null;
  /** 네이버 블로그 카테고리 key ('auto' 가능) */
  naverCategory?: string | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await req.json()) as Body;
  if (!body.clientId || !body.channel || !body.topic?.trim()) {
    return new Response("clientId, channel, topic는 필수입니다.", { status: 400 });
  }

  // 플랜에서 진입한 경우 그 플랜이 이 고객사의 것인지 확인 — 아니면 연결하지 않는다 [코덱스 2차 ①]
  const planId: string | null = body.planId ?? null;
  if (planId) {
    const { data: plan } = await supabase
      .from("content_plans")
      .select("id, client_id, channel")
      .eq("id", planId)
      .maybeSingle();
    if (!plan || plan.client_id !== body.clientId) {
      return new Response("이 플랜은 지금 고른 고객사의 것이 아닙니다. 고객사 카드에서 플랜을 다시 여세요.", { status: 400 });
    }
    if (plan.channel !== body.channel) {
      return new Response("플랜의 채널과 생성 채널이 다릅니다.", { status: 400 });
    }
  }

  // 채널 프리셋 조회
  const { data: settings } = await supabase
    .from("channel_settings")
    .select("preset, category")
    .eq("client_id", body.clientId)
    .eq("channel", body.channel)
    .single();

  const { data: clientRow } = await supabase
    .from("clients")
    .select("is_internal, name")
    .eq("id", body.clientId)
    .single();
  // 고객사 콘텐츠 기준 (0028 미적용이면 null)
  const { data: brief } = await supabase.from("client_briefs").select("*").eq("client_id", body.clientId).maybeSingle();

  // 프리셋 미등록 클라이언트도 기본 설정으로 생성 (프리셋 편집 UI 제거됨)
  const preset = (settings?.preset ?? {}) as Record<string, unknown>;
  const system = buildSystemPrompt({
    channel: body.channel,
    preset,
    contentType: body.contentType ?? null,
    topic: body.topic,
    extraInstructions: body.extraInstructions,
    isInternalClient: clientRow?.is_internal ?? false,
    naverCategory: body.naverCategory ?? null,
    clientName: clientRow?.name ?? null,
    blogCategory: (settings as { category?: string | null } | null)?.category ?? null,
    brief: brief ?? null,
  });
  const userPrompt = buildUserPrompt({
    channel: body.channel,
    preset,
    topic: body.topic,
    extraInstructions: body.extraInstructions,
  });

  const maxTokens = body.channel === "wordpress" ? 32000 : 16000;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";
      const meta: StreamMeta = {
        contentId: null,
        inputTokens: 0,
        outputTokens: 0,
        model: currentGenerationModel(),
      };

      try {
        const final = await streamText(
          { system, user: userPrompt, maxTokens },
          (delta) => {
            fullText += delta;
            controller.enqueue(encoder.encode(delta));
          },
        );
        meta.inputTokens = final.inputTokens;
        meta.outputTokens = final.outputTokens;
        meta.model = final.model;

        // 네이버: 카테고리 확정 — 사용자가 고른 값 우선, auto면 본문 끝 마커에서 파싱
        if (body.channel === "naver_blog") {
          const picked =
            body.naverCategory && body.naverCategory !== "auto"
              ? (getNaverCategory(body.naverCategory)?.label ?? null)
              : null;
          const m = fullText.match(NAVER_CATEGORY_MARKER_RE);
          if (m) {
            fullText = fullText.replace(NAVER_CATEGORY_MARKER_RE, "").trimEnd();
          }
          meta.naverCategory =
            picked ??
            (m
              ? (matchNaverCategoryByLabel(m[1])?.label ?? m[1].trim())
              : null);
        }

        // 생성 결과 저장 (승인 상태: owner→approved, member→pending)
        const approval = await approvalFieldsForCreator(supabase, user.id);
        const { data: inserted } = await supabase
          .from("contents")
          .insert({
            client_id: body.clientId,
            plan_id: planId,
            channel: body.channel,
            content_type: body.contentType ?? null,
            title: body.topic.trim().slice(0, 120),
            body: fullText,
            model: meta.model,
            input_tokens: meta.inputTokens,
            output_tokens: meta.outputTokens,
            created_by: user.id,
            ...approval,
          })
          .select("id")
          .single();
        meta.contentId = inserted?.id ?? null;

        // 카테고리는 meta 컬럼에 best-effort 저장 (0006 미적용 환경에서도 생성은 성공)
        if (inserted?.id && meta.naverCategory) {
          await supabase
            .from("contents")
            .update({ meta: { naver_category: meta.naverCategory } })
            .eq("id", inserted.id);
        }

        // 플랜 연결 시 상태를 review로
        if (planId) {
          await supabase
            .from("content_plans")
            .update({ status: "review" })
            .eq("id", planId)
            .eq("client_id", body.clientId);
        }

        // 사용량 기록
        await logApiUsage({
          userId: user.id,
          clientId: body.clientId,
          provider: generationProvider(),
          model: meta.model,
          inputTokens: meta.inputTokens,
          outputTokens: meta.outputTokens,
        });
      } catch (err) {
        meta.error = err instanceof Error ? err.message : "생성 중 오류가 발생했습니다.";
      }

      controller.enqueue(encoder.encode(META_DELIMITER + JSON.stringify(meta)));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
