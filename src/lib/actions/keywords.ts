"use server";

import { createClient } from "@/lib/supabase/server";
import type { KeywordIdea } from "@/lib/google-ads";

interface AddInput {
  clientId: string;
  channel: string;
  ideas: KeywordIdea[];
}

/**
 * 선택 키워드를 keywords(status='planned')로 저장하고 content_plans를 일괄 생성.
 * 채널 기본 담당자(channel_settings.default_assignee)를 자동 배정.
 */
export async function addKeywordsToPlan(
  input: AddInput,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const supabase = await createClient();

  const { data: cs } = await supabase
    .from("channel_settings")
    .select("default_assignee")
    .eq("client_id", input.clientId)
    .eq("channel", input.channel)
    .single();

  const { data: kws, error: kwErr } = await supabase
    .from("keywords")
    .insert(
      input.ideas.map((i) => ({
        client_id: input.clientId,
        keyword: i.keyword,
        avg_monthly_searches: i.avgMonthlySearches,
        competition: i.competition,
        cpc_low: i.cpcLow,
        cpc_high: i.cpcHigh,
        source: "google_ads",
        status: "planned",
      })),
    )
    .select("id, keyword");

  if (kwErr || !kws) {
    return { ok: false, count: 0, error: kwErr?.message ?? "키워드 저장 실패" };
  }

  const { error: planErr } = await supabase.from("content_plans").insert(
    kws.map((k: { id: string; keyword: string }) => ({
      client_id: input.clientId,
      keyword_id: k.id,
      title: k.keyword,
      channel: input.channel,
      status: "idea",
      assignee: cs?.default_assignee ?? null,
    })),
  );

  if (planErr) return { ok: false, count: 0, error: planErr.message };
  return { ok: true, count: kws.length };
}
