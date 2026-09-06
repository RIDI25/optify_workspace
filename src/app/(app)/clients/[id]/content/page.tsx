import { Suspense } from "react";
import { ClientContent } from "@/components/clients/client-content";

export default function ClientContentPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">불러오는 중…</p>}>
      <ClientContent />
    </Suspense>
  );
}
