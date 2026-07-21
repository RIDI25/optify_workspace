import { requireOwner } from "@/lib/auth";
import { SalesView } from "@/components/sales/sales-view";

export default async function SalesPage() {
  await requireOwner(); // 영업·매출 데이터 — owner 전용 (RLS로도 차단)
  return <SalesView />;
}
