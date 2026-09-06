import { Suspense } from "react";
import { TrackingView } from "@/components/tracking/tracking-view";

export default function ClientGeoPage() {
  return (
    <Suspense fallback={null}>
      <TrackingView scope="geo" />
    </Suspense>
  );
}
