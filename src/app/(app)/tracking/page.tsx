import { Suspense } from "react";
import { TrackingView } from "@/components/tracking/tracking-view";

/** ?view=geo (AI 노출) | ?view=seo (검색 순위). 같은 데이터를 관점만 바꿔 본다. */
export default function TrackingPage() {
  return (
    <Suspense fallback={null}>
      <TrackingView />
    </Suspense>
  );
}
