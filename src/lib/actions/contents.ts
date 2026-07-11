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

/** KST 기준 오늘 날짜 (서버는 UTC — toISOString은 아침에 전날로 밀린다) */
function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

/**
 * 발행 완료 수동 표시 [AUDIT M-1].
 * 네이버/스레드는 외부에서 수동 발행하므로 published_at을 직접 기록해
 * 대시보드·리포트의 발행 집계에 반영한다.
 * 캘린더 반영 보장: 플랜이 없으면 자동 생성하고, 예정일이 없으면 오늘로 채운다
 * — 캘린더는 scheduled_date 있는 플랜만 그리기 때문.
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
  if (error) return { ok: false, publishedAt: null, error: error.message };

  const { data: c } = await supabase
    .from("contents")
    .select("plan_id, client_id, channel, title")
    .eq("id", contentId)
    .single();
  if (!c) return { ok: true, publishedAt };

  if (c.plan_id) {
    // 연결된 플랜 상태 동기화 + 발행 시 날짜 없으면 오늘로
    const patch: Record<string, unknown> = {
      status: published ? "published" : "review",
    };
    if (published) {
      const { data: plan } = await supabase
        .from("content_plans")
        .select("scheduled_date")
        .eq("id", c.plan_id)
        .single();
      if (!plan?.scheduled_date) patch.scheduled_date = todayKst();
    }
    await supabase.from("content_plans").update(patch).eq("id", c.plan_id);
  } else if (published) {
    // 플랜 미연결 콘텐츠 — 발행 표시 시 오늘 날짜 플랜을 자동 생성해 캘린더에 반영
    const { data: cs } = await supabase
      .from("channel_settings")
      .select("default_assignee")
      .eq("client_id", c.client_id)
      .eq("channel", c.channel)
      .single();
    const { data: plan } = await supabase
      .from("content_plans")
      .insert({
        client_id: c.client_id,
        title: c.title || "(제목 없음)",
        channel: c.channel,
        status: "published",
        scheduled_date: todayKst(),
        assignee: cs?.default_assignee ?? null,
      })
      .select("id")
      .single();
    if (plan) {
      await supabase
        .from("contents")
        .update({ plan_id: plan.id })
        .eq("id", contentId);
    }
  }
  return { ok: true, publishedAt };
}

/**
 * 플랜 단위 발행 완료 표시/해제 (캘린더 날짜 패널용).
 * 연결된 최신 콘텐츠의 published_at도 함께 동기화한다.
 * 해제 시: 콘텐츠가 있으면 review, 글감뿐이면 idea로 되돌린다.
 */
export async function markPlanPublished(
  planId: string,
  published: boolean,
): Promise<{ ok: boolean; status?: PlanStatus; error?: string }> {
  const supabase = await createClient();

  const { data: latest } = await supabase
    .from("contents")
    .select("id")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const status: PlanStatus = published
    ? "published"
    : latest
      ? "review"
      : "idea";
  const { error } = await supabase
    .from("content_plans")
    .update({ status })
    .eq("id", planId);
  if (error) return { ok: false, error: error.message };

  if (latest) {
    await supabase
      .from("contents")
      .update({ published_at: published ? new Date().toISOString() : null })
      .eq("id", latest.id);
  }
  return { ok: true, status };
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

interface CompleteContentInput {
  clientId: string;
  channel: string;
  title: string;
  contentId: string | null;
  /** 이미 플랜에서 생성한 경우 그 플랜을 갱신, 없으면 새 플랜 생성 */
  planId?: string | null;
  /** 발행(예정)일 'YYYY-MM-DD' */
  scheduledDate?: string | null;
  /** true=발행 완료, false=대기중(review) */
  publish: boolean;
}

/**
 * 생성 완료 처리 — 날짜와 발행 상태를 지정해 플랜에 반영한다.
 * 발행 완료 선택 시 콘텐츠 published_at도 함께 기록해 리포트 집계와 일치시킨다.
 */
export async function completeContent(
  input: CompleteContentInput,
): Promise<{ ok: boolean; planId?: string; error?: string }> {
  const supabase = await createClient();
  const status: PlanStatus = input.publish ? "published" : "review";

  let planId = input.planId ?? null;
  if (planId) {
    const { error } = await supabase
      .from("content_plans")
      .update({ status, scheduled_date: input.scheduledDate || null })
      .eq("id", planId);
    if (error) return { ok: false, error: error.message };
  } else {
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
        title: input.title || "(제목 없음)",
        channel: input.channel,
        status,
        scheduled_date: input.scheduledDate || null,
        assignee: cs?.default_assignee ?? null,
      })
      .select("id")
      .single();
    if (error || !plan) {
      return { ok: false, error: error?.message ?? "플랜 생성 실패" };
    }
    planId = plan.id;
  }

  if (input.contentId) {
    const patch: Record<string, unknown> = { plan_id: planId };
    if (input.publish) patch.published_at = new Date().toISOString();
    await supabase.from("contents").update(patch).eq("id", input.contentId);
  }
  return { ok: true, planId: planId ?? undefined };
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
