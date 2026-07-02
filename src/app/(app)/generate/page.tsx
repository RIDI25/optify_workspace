import { Suspense } from "react";
import { GenerateView } from "@/components/generate/generate-view";

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">불러오는 중…</div>}>
      <GenerateView />
    </Suspense>
  );
}
