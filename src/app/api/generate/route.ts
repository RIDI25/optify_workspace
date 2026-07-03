import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAnthropic, GENERATION_MODEL } from "@/lib/anthropic";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/generation/engine";
import { logApiUsage } from "@/lib/usage";
import { approvalFieldsForCreator } from "@/lib/approval";
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

  // 채널 프리셋 조회
  const { data: settings } = await supabase
    .from("channel_settings")
    .select("preset")
    .eq("client_id", body.clientId)
    .eq("channel", body.channel)
    .single();

  if (!settings) {
    return new Response("해당 클라이언트/채널의 프리셋이 없습니다.", {
      status: 404,
    });
  }

  const preset = settings.preset as Record<string, unknown>;
  const system = buildSystemPrompt({
    channel: body.channel,
    preset,
    contentType: body.contentType ?? null,
    topic: body.topic,
    extraInstructions: body.extraInstructions,
  });
  const userPrompt = buildUserPrompt({
    channel: body.channel,
    preset,
    topic: body.topic,
    extraInstructions: body.extraInstructions,
  });

  const maxTokens = body.channel === "wordpress" ? 32000 : 16000;
  const encoder = new TextEncoder();
  const anthropic = createAnthropic();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";
      const meta: StreamMeta = {
        contentId: null,
        inputTokens: 0,
        outputTokens: 0,
        model: GENERATION_MODEL,
      };

      try {
        const ms = anthropic.messages.stream({
          model: GENERATION_MODEL,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: userPrompt }],
        });

        for await (const event of ms) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullText += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await ms.finalMessage();
        meta.inputTokens = final.usage.input_tokens;
        meta.outputTokens = final.usage.output_tokens;

        // 생성 결과 저장 (승인 상태: owner→approved, member→pending)
        const approval = await approvalFieldsForCreator(supabase, user.id);
        const { data: inserted } = await supabase
          .from("contents")
          .insert({
            client_id: body.clientId,
            plan_id: body.planId ?? null,
            channel: body.channel,
            content_type: body.contentType ?? null,
            title: body.topic.trim().slice(0, 120),
            body: fullText,
            model: GENERATION_MODEL,
            input_tokens: meta.inputTokens,
            output_tokens: meta.outputTokens,
            created_by: user.id,
            ...approval,
          })
          .select("id")
          .single();
        meta.contentId = inserted?.id ?? null;

        // 플랜 연결 시 상태를 review로
        if (body.planId) {
          await supabase
            .from("content_plans")
            .update({ status: "review" })
            .eq("id", body.planId);
        }

        // 사용량 기록
        await logApiUsage({
          userId: user.id,
          clientId: body.clientId,
          provider: "anthropic",
          model: GENERATION_MODEL,
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
