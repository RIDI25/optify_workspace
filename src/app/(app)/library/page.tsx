import { Suspense } from "react";
import { LibraryView } from "@/components/library/library-view";

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">불러오는 중…</div>}>
      <LibraryView />
    </Suspense>
  );
}
