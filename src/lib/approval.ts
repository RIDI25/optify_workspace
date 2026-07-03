import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * 생성물의 초기 승인 필드. owner가 만든 콘텐츠는 자동 approved,
 * member가 만든 것만 pending(발행 게이트 대상).
 */
export async function approvalFieldsForCreator(
  supabase: ServerClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (data?.role === "owner") {
    return {
      approval_status: "approved",
      approved_by: userId,
      approved_at: new Date().toISOString(),
    };
  }
  return { approval_status: "pending" };
}
