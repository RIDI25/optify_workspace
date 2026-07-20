import { requireOwner } from "@/lib/auth";
import { QuotesView } from "@/components/quotes/quotes-view";

export default async function QuotesPage() {
  await requireOwner(); // 단가 정보 포함 — owner 전용 (RLS로도 차단)
  return <QuotesView />;
}
