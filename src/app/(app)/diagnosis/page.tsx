import { requireOwner } from "@/lib/auth";
import { DiagnosisView } from "@/components/diagnosis/diagnosis-view";

export default async function DiagnosisPage() {
  await requireOwner(); // 영업 도구 — owner 전용 (RLS로도 차단)
  return <DiagnosisView />;
}
