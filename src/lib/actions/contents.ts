"use server";

import { createClient } from "@/lib/supabase/server";

/** 이미지 삽입이 끝난 최종 HTML과 이미지 URL 배열을 콘텐츠에 반영 */
export async function finalizeContentHtml(
  contentId: string,
  finalHtml: string,
  imageUrls: string[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contents")
    .update({ body: finalHtml, images: imageUrls })
    .eq("id", contentId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

interface SendToPlanInput {
  clientId: string;
  channel: string;
  title: string;
  contentId: string | null;
  scheduledDate?: string | null; // 'YYYY-MM-DD' 또는 null
  status: "idea" | "writing";
}

/**
 * 생성물을 콘텐츠 플랜으로 보낸다.
 * content_plans 행을 만들고, 해당 콘텐츠(contentId)를 그 플랜에 연결(contents.plan_id)한다.
 * 채널 기본 담당자를 자동 배정.
 */
export async function sendToPlan(
  input: SendToPlanInput,
): Promise<{ ok: boolean; planId?: string; error?: string }> {
  const supabase = await createClient();

  const { data: cs } = await supabase
    .from("channel_settings")
    .select("default_assignee")
    .eq("client_id", input.clientId)
    .eq("channel", input.channel)
    .single();

  const { data: plan, error: planErr } = await supabase
    .from("content_plans")
    .insert({
      client_id: input.clientId,
      title: input.title || "(제목 없음)",
      channel: input.channel,
      status: input.status,
      scheduled_date: input.scheduledDate || null,
      assignee: cs?.default_assignee ?? null,
    })
    .select("id")
    .single();

  if (planErr || !plan) {
    return { ok: false, error: planErr?.message ?? "플랜 생성 실패" };
  }

  if (input.contentId) {
    await supabase
      .from("contents")
      .update({ plan_id: plan.id })
      .eq("id", input.contentId);
  }

  return { ok: true, planId: plan.id };
}
