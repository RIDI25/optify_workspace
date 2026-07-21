import { requireOwner } from "@/lib/auth";
import { QuotesView } from "@/components/quotes/quotes-view";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string; diagnosisId?: string }>;
}) {
  await requireOwner(); // 단가 정보 포함 — owner 전용 (RLS로도 차단)
  const { leadId, diagnosisId } = await searchParams;
  return <QuotesView leadId={leadId ?? null} diagnosisId={diagnosisId ?? null} />;
}
