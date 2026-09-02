import { requireProfile } from "@/lib/auth";
import { SalesView } from "@/components/sales/sales-view";

export default async function SalesPage() {
  // 조회는 팀 전체, 등록·수정은 owner 전용 (RLS 0023)
  const profile = await requireProfile();
  return <SalesView readOnly={profile.role !== "owner"} />;
}
