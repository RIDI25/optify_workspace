"use server";

import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";

interface ClientPatch {
  name?: string;
  gsc_site_url?: string | null;
  ga4_property_id?: string | null;
  status?: "active" | "paused" | "ended";
  memo?: string | null;
}

/** 클라이언트 저장(신규 insert 또는 update). owner만 — RLS로 강제. */
export async function saveClient(
  id: string | null,
  patch: ClientPatch,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("clients").update(patch).eq("id", id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("clients")
    .insert({ ...patch, created_by: user?.id ?? null });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** 채널 프리셋(jsonb) 저장. owner만. */
export async function savePreset(
  clientId: string,
  channel: string,
  preset: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("channel_settings")
    .upsert(
      { client_id: clientId, channel, preset },
      { onConflict: "client_id,channel" },
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** 채널 기본 담당자 저장. owner만 — RLS로 강제. */
export async function saveChannelAssignee(
  clientId: string,
  channel: string,
  assignee: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("channel_settings")
    .update({ default_assignee: assignee })
    .eq("client_id", clientId)
    .eq("channel", channel);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** WP 연결 정보 저장. 비밀번호는 서버에서 암호화. owner만. */
export async function saveWpConnection(
  clientId: string,
  input: { wpUrl: string; wpUsername: string; wpPassword?: string },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    client_id: clientId,
    channel: "wordpress",
    wp_url: input.wpUrl || null,
    wp_username: input.wpUsername || null,
  };
  if (input.wpPassword) {
    patch.wp_app_password_encrypted = encryptSecret(input.wpPassword);
  }
  const { error } = await supabase
    .from("channel_settings")
    .upsert(patch, { onConflict: "client_id,channel" });
  return error ? { ok: false, error: error.message } : { ok: true };
}
