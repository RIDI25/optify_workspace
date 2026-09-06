import { Suspense } from "react";
import { TrackingView } from "@/components/tracking/tracking-view";

export default function ClientSeoPage() {
  return (
    <Suspense fallback={null}>
      <TrackingView scope="seo" />
    </Suspense>
  );
}
