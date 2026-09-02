import { requireProfile } from "@/lib/auth";
import { RevenueView } from "@/components/revenue/revenue-view";

export default async function RevenuePage() {
  // 조회는 팀 전체, 등록·수정은 owner 전용 (RLS 0023)
  const profile = await requireProfile();
  return <RevenueView readOnly={profile.role !== "owner"} />;
}
