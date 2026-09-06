"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LEGACY_ROUTES, clientPath } from "@/lib/nav";
import { useClientContext } from "@/components/providers/client-context";

/**
 * 옛 주소(/plans, /generate, /library, /keywords, /reports, /tracking)를 지금 고객사의 카드 탭으로 보낸다.
 * 쿼리(planId, contentId, title …)는 그대로 넘긴다. 기존 링크·북마크가 계속 동작하도록 주소 자체는 남겨 둔다.
 */
export function LegacyRedirect({ from }: { from: keyof typeof LEGACY_ROUTES }) {
  const router = useRouter();
  const params = useSearchParams();
  const { selectedClientId, loading } = useClientContext();
  useEffect(() => {
    if (loading) return;
    const target = LEGACY_ROUTES[from];
    const q = new URLSearchParams(params.toString());
    if (target.view) q.set("view", target.view);
    if (from === "/tracking" && params.get("view") === "seo") {
      q.delete("view");
      router.replace(selectedClientId ? clientPath(selectedClientId, "seo", q.toString()) : "/clients");
      return;
    }
    if (from === "/tracking") q.delete("view");
    router.replace(selectedClientId ? clientPath(selectedClientId, target.tab, q.toString()) : "/clients");
  }, [from, loading, params, router, selectedClientId]);
  return <p className="text-sm text-muted">고객사 카드로 이동합니다…</p>;
}
