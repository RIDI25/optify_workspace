import { Suspense } from "react";
import { TrackingView } from "@/components/tracking/tracking-view";
import { PeecGeoView } from "@/components/tracking/peec-geo-view";

/** GEO 탭 — Peec AI 결과가 기본 (2026-09-28). 맥 직접 측정 기록은 아래 접힌 칸에 남긴다. */
export default function ClientGeoPage() {
  return (
    <Suspense fallback={null}>
      <div className="space-y-6">
        <PeecGeoView />
        <details className="rounded-lg border border-border bg-subtle/40 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-muted">이전 직접 측정 기록 (맥 트래커, 2026-09-28 에 끔)</summary>
          <div className="mt-4">
            <TrackingView scope="geo" hideControls />
          </div>
        </details>
      </div>
    </Suspense>
  );
}
