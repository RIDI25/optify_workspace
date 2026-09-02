import { requireProfile } from "@/lib/auth";
import { LedgerView } from "@/components/ledger/ledger-view";

export default async function LedgerPage() {
  // 기입은 서무 업무 — 팀 전체 읽기/쓰기 (RLS 0024)
  const profile = await requireProfile();
  return <LedgerView meId={profile.id} />;
}
