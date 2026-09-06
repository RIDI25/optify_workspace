import { Suspense } from "react";
import { LegacyRedirect } from "@/components/providers/legacy-redirect";

/** 옛 주소 — 지금 고객사의 카드 탭으로 안내 (2026-09-06 개편) */
export default function LegacyPage() {
  return (
    <Suspense fallback={null}>
      <LegacyRedirect from="/keywords" />
    </Suspense>
  );
}
