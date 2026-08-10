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
];

export function ClientTabs() {
  const pathname = usePathname();
  const { clients, selectedClientId, setSelectedClientId, loading } =
    useClientContext();

  const isContent =
    pathname === "/" || CONTENT_ROUTES.some((r) => pathname.startsWith(r));
  if (!isContent || loading || clients.length === 0) return null;

  return (
    <div className="border-b-2 border-accent-deep/20 bg-tint/30 px-4 md:px-6">
      <div className="flex items-center gap-2 overflow-x-auto py-2">
        <span className="mr-1 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted">
          클라이언트
        </span>
        {clients.map((c) => {
          const active = c.id === selectedClientId;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedClientId(c.id)}
              className={[
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-all",
                active
                  ? "bg-accent-deep font-bold text-white shadow-sm"
                  : "border border-border bg-surface font-medium text-muted hover:border-accent-deep/40 hover:text-ink",
              ].join(" ")}
            >
              {active && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              )}
              {c.name}
              {c.is_internal && (
                <span
                  className={[
                    "rounded px-1 py-px text-[10px] font-medium",
                    active ? "bg-white/20 text-white" : "bg-subtle text-muted",
                  ].join(" ")}
                >
                  내부
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
