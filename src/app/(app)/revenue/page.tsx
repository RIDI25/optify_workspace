import { requireOwner } from "@/lib/auth";
import { RevenueView } from "@/components/revenue/revenue-view";

export default async function RevenuePage() {
  await requireOwner(); // 재무 데이터 — owner 전용 (RLS로도 차단)
  return <RevenueView />;
}
