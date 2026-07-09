"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  ContentImage,
  ContentMeta,
  ContentPlan,
  PlanStatus,
} from "@/types/database";

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
 * 콘텐츠 삭제. RLS상 팀 멤버 누구나 가능(현행 정책 유지).
 * contents.plan_id는 참조만 하므로 플랜은 영향 없음. Storage 이미지는 남김(정리는 후속 과제).
 * content_comments는 FK ON DELETE CASCADE로 함께 삭제(0009).
 */
export async function deleteContent(
  contentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("contents").delete().eq("id", contentId);
  return error ? { ok: false, error: error.message } : { ok: true };
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

/**
 * 콘텐츠 플랜 삭제. 연결된 콘텐츠의 plan_id는 FK ON DELETE SET NULL로 자동 해제 —
 * 생성물은 라이브러리에 그대로 남는다. RLS상 팀 멤버 삭제 가능(현행 유지).
 */
export async function deletePlan(
  planId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("content_plans")
    .delete()
    .eq("id", planId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** 콘텐츠 승인/반려 (owner 전용, DB 트리거로도 강제). 반려 시 사유는 코멘트로 저장. */
export async function approveContent(
  contentId: string,
  decision: "approved" | "rejected",
  comment?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "인증 필요" };
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (prof?.role !== "owner") {
    return { ok: false, error: "승인/반려는 관리자만 가능합니다." };
  }
  const { error } = await supabase
    .from("contents")
    .update({
      approval_status: decision,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", contentId);
  if (error) return { ok: false, error: error.message };
  if (decision === "rejected" && comment?.trim()) {
    await supabase.from("content_comments").insert({
      content_id: contentId,
      author: user.id,
      body: comment.trim(),
    });
  }
  return { ok: true };
}

/** 코멘트 작성 (인증 사용자). */
export async function addComment(
  contentId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "인증 필요" };
  if (!body.trim()) return { ok: false, error: "내용을 입력하세요." };
  const { error } = await supabase.from("content_comments").insert({
    content_id: contentId,
    author: user.id,
    body: body.trim(),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** 코멘트 삭제 (본인 것만 — RLS로 강제). */
export async function deleteComment(
  commentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("content_comments")
    .delete()
    .eq("id", commentId);
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

interface ExternalPostInput {
  clientId: string;
  title: string;
  url: string;
  channel: string;
  status: PlanStatus;
  scheduledDate?: string | null; // 'YYYY-MM-DD' 또는 null
  memo?: string | null;
}

/**
 * 생성 엔진을 거치지 않고 따로 작성한 글을 제목+링크로 플랜에 등록.
 * 채널 기본 담당자를 자동 배정. external_url 컬럼은 마이그레이션 0012 필요.
 */
export async function addExternalPost(
  input: ExternalPostInput,
): Promise<{ ok: boolean; plan?: ContentPlan; error?: string }> {
  const supabase = await createClient();

  const title = input.title.trim();
  const url = input.url.trim();
  if (!title) return { ok: false, error: "제목을 입력하세요." };
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: "링크는 http:// 또는 https://로 시작해야 합니다." };
  }

  const { data: cs } = await supabase
    .from("channel_settings")
    .select("default_assignee")
    .eq("client_id", input.clientId)
    .eq("channel", input.channel)
    .single();

  const { data: plan, error } = await supabase
    .from("content_plans")
    .insert({
      client_id: input.clientId,
      title,
      channel: input.channel,
      status: input.status,
      scheduled_date: input.scheduledDate || null,
      assignee: cs?.default_assignee ?? null,
      memo: input.memo?.trim() || null,
      external_url: url,
    })
    .select("*")
    .single();

  if (error || !plan) {
    return { ok: false, error: error?.message ?? "플랜 생성 실패" };
  }
  return { ok: true, plan: plan as ContentPlan };
}

/** 플랜의 외부 글 링크 추가/수정/제거 (null이면 제거). */
export async function updatePlanExternalUrl(
  planId: string,
  url: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const trimmed = url?.trim() || null;
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    return { ok: false, error: "링크는 http:// 또는 https://로 시작해야 합니다." };
  }
  const { error } = await supabase
    .from("content_plans")
    .update({ external_url: trimmed })
    .eq("id", planId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
