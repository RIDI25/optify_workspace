"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureOnboardingTasks } from "@/lib/actions/onboarding";

/**
 * 수주한 리드 → 클라이언트 전환 (owner 전용 — RLS로 강제).
 * clients 행 생성 + 리드 연결 + 기본 온보딩 태스크 자동 발급.
 * 이미 전환된 리드는 기존 clientId 반환(멱등).
 */
export async function convertLeadToClient(
  leadId: string,
): Promise<{ ok: boolean; error?: string; clientId?: string }> {
  const supabase = await createClient();

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();
  if (leadErr || !lead) return { ok: false, error: leadErr?.message ?? "리드를 찾을 수 없음" };
  if (lead.client_id) return { ok: true, clientId: lead.client_id };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const memoParts = [
    lead.industry && `업종: ${lead.industry}`,
    lead.region && `지역: ${lead.region}`,
    lead.contact_name && `담당: ${lead.contact_name}`,
    lead.phone,
    lead.email,
    lead.memo,
  ].filter(Boolean);

  const { data: client, error: cErr } = await supabase
    .from("clients")
    .insert({
      name: lead.company_name,
      is_internal: false,
      status: "active",
      memo: memoParts.join(" · ") || null,
      created_by: user?.id ?? null,
    })
    .select()
    .single();
  if (cErr || !client) return { ok: false, error: cErr?.message ?? "클라이언트 생성 실패" };

  await supabase
    .from("leads")
    .update({ client_id: client.id, status: "won", updated_at: new Date().toISOString() })
    .eq("id", leadId);

  await ensureOnboardingTasks(client.id);
  return { ok: true, clientId: client.id };
}
