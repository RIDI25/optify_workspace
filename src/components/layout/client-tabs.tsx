"use client";

import { usePathname } from "next/navigation";
import { useClientContext } from "@/components/providers/client-context";

/**
 * 클라이언트 선택 탭 — 콘텐츠 워크플로우 화면에서만 표시.
 * 영업(리드·매출·진단·견적)은 클라이언트와 무관하므로 표시하지 않는다.
 */
const CONTENT_ROUTES = [
  "/daily",
  "/keywords",
  "/plans",
  "/generate",
  "/library",
  "/reports",
  "/settings",
];

export function ClientTabs() {
  const pathname = usePathname();
  const { clients, selectedClientId, setSelectedClientId, loading } =
    useClientContext();

  const isContent =
    pathname === "/" || CONTENT_ROUTES.some((r) => pathname.startsWith(r));
  if (!isContent || loading || clients.length === 0) return null;

  return (
    <div className="border-b border-border bg-surface px-4 md:px-6">
      <div className="flex items-center gap-1 overflow-x-auto py-1.5">
        <span className="mr-1 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted">
          클라이언트
        </span>
        {clients.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedClientId(c.id)}
            className={[
              "shrink-0 rounded-md px-3 py-1 text-sm font-medium transition-colors",
              c.id === selectedClientId
                ? "bg-tint text-accent-deep"
                : "text-muted hover:bg-subtle hover:text-ink",
            ].join(" ")}
          >
            {c.name}
            {c.is_internal && (
              <span className="ml-1 text-[10px] text-muted">내부</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
