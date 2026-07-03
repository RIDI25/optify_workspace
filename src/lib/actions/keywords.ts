"use server";

import { createClient } from "@/lib/supabase/server";
import type { KeywordIdea } from "@/lib/google-ads";

interface AddInput {
  clientId: string;
  channel: string;
  ideas: KeywordIdea[];
  source?: string; // 'google_ads' | 'naver_ads' | 'gsc' …
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
        source: input.source ?? "google_ads",
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

/** 생성된 주제(제목안)를 플랜에 추가. 선택 채널 + (선택) 키워드 연결. */
export async function addTopicToPlan(input: {
  clientId: string;
  channel: string;
  title: string;
  keywordId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: cs } = await supabase
    .from("channel_settings")
    .select("default_assignee")
    .eq("client_id", input.clientId)
    .eq("channel", input.channel)
    .single();
  const { error } = await supabase.from("content_plans").insert({
    client_id: input.clientId,
    keyword_id: input.keywordId ?? null,
    title: input.title,
    channel: input.channel,
    status: "idea",
    assignee: cs?.default_assignee ?? null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
