"use server";

import { createClient } from "@/lib/supabase/server";
import type { ContentImage, ContentMeta } from "@/types/database";

/**
 * 콘텐츠 자산 저장. body/images는 항상 반영, meta는 best-effort
 * (contents.meta 컬럼은 마이그레이션 0006 필요 — 없으면 무시).
 */
export async function saveContentAssets(
  contentId: string,
  patch: { body?: string; images?: ContentImage[]; meta?: ContentMeta },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const base: Record<string, unknown> = {};
  if (patch.body !== undefined) base.body = patch.body;
  if (patch.images !== undefined) base.images = patch.images;
  if (Object.keys(base).length > 0) {
    const { error } = await supabase
      .from("contents")
      .update(base)
      .eq("id", contentId);
    if (error) return { ok: false, error: error.message };
  }

  if (patch.meta !== undefined) {
    const { error } = await supabase
      .from("contents")
      .update({ meta: patch.meta })
      .eq("id", contentId);
    if (error) {
      // 0006 미실행 시 meta 컬럼이 없을 수 있음 — 흐름은 막지 않음
      console.error("[saveContentAssets] meta 저장 실패(0006 미실행?):", error.message);
    }
  }

  return { ok: true };
}

/**
 * 발행 완료 수동 표시 [AUDIT M-1].
 * 네이버/스레드는 외부에서 수동 발행하므로 published_at을 직접 기록해
 * 대시보드·리포트의 발행 집계에 반영한다.
 */
export async function setPublishedStatus(
  contentId: string,
  published: boolean,
): Promise<{ ok: boolean; publishedAt: string | null; error?: string }> {
  const supabase = await createClient();
  const publishedAt = published ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("contents")
    .update({ published_at: publishedAt })
    .eq("id", contentId);
  return error
    ? { ok: false, publishedAt: null, error: error.message }
    : { ok: true, publishedAt };
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
