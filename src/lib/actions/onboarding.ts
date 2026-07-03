"use server";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ONBOARDING_TASKS, type AutoSignals } from "@/lib/onboarding";

/** 자동완료 감지 신호 (서버에서만 계산 — WP 암호문 노출 금지). */
export async function getOnboardingSignals(
  clientId: string,
): Promise<AutoSignals> {
  const supabase = await createClient();
  const [clientRes, wpRes, presetRes, kwRes] = await Promise.all([
    supabase
      .from("clients")
      .select("gsc_site_url, ga4_property_id")
      .eq("id", clientId)
      .single(),
    supabase
      .from("channel_settings")
      .select("wp_app_password_encrypted")
      .eq("client_id", clientId)
      .eq("channel", "wordpress")
      .maybeSingle(),
    supabase.from("channel_settings").select("id").eq("client_id", clientId).limit(1),
    supabase.from("keywords").select("id").eq("client_id", clientId).limit(1),
  ]);
  const c = clientRes.data;
  return {
    hasGscGa4Ids: !!(c?.gsc_site_url && c?.ga4_property_id),
    hasWpCreds: !!wpRes.data?.wp_app_password_encrypted,
    hasPresets: (presetRes.data?.length ?? 0) > 0,
    hasKeywords: (kwRes.data?.length ?? 0) > 0,
  };
}

/** 클라이언트에 기본 온보딩 태스크가 없으면 생성(멱등). owner만 — RLS로 강제. */
export async function ensureOnboardingTasks(
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("client_onboarding_tasks")
    .select("id")
    .eq("client_id", clientId)
    .limit(1);
  if (existing && existing.length > 0) return { ok: true };

  const { error } = await supabase.from("client_onboarding_tasks").insert(
    DEFAULT_ONBOARDING_TASKS.map((t) => ({
      client_id: clientId,
      task_key: t.key,
      label: t.label,
    })),
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** 태스크 완료 토글. owner만. */
export async function toggleOnboardingTask(
  taskId: string,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("client_onboarding_tasks")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", taskId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
