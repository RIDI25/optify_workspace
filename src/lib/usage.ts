import { createAdminClient } from "@/lib/supabase/server";
import { estimateCostUsd } from "@/lib/pricing";

interface LogUsageInput {
  userId: string | null;
  clientId: string | null;
  provider: string; // 'anthropic' | 'gemini' | 'google_ads' | 'gsc' | 'ga4'
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * API 사용량 기록 (서버 전용, service role — RLS 우회).
 * 실패해도 요청 흐름을 막지 않도록 예외를 삼킨다.
 */
export async function logApiUsage(input: LogUsageInput) {
  try {
    const admin = createAdminClient();
    const cost = input.model
      ? estimateCostUsd(input.model, input.inputTokens ?? 0, input.outputTokens ?? 0)
      : null;
    await admin.from("api_usage_logs").insert({
      user_id: input.userId,
      client_id: input.clientId,
      provider: input.provider,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      estimated_cost_usd: cost,
    });
  } catch (err) {
    console.error("[logApiUsage] failed:", err);
  }
}
