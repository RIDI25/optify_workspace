"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import type { Role } from "@/types/database";

/** 데스크톱 사이드바·모바일 드로어 공용 메뉴 목록 */
export function NavList({
  role,
  onNavigate,
}: {
  role: Role;
  /** 모바일 드로어에서 링크 클릭 시 닫기용 */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
      {NAV_ITEMS.filter((item) => !item.ownerOnly || role === "owner").map((item, i, visible) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        // 같은 섹션 캡션이 연속되면 첫 항목에만 표시 (ownerOnly 필터 후 기준)
        const showSection =
          item.section && visible[i - 1]?.section !== item.section;
        return (
          <div key={item.href}>
            {showSection && (
              <p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-muted">
                {item.section}
              </p>
            )}
            <Link
              href={item.href}
              onClick={onNavigate}
              className={[
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-tint text-accent-deep"
                  : "text-ink hover:bg-subtle",
              ].join(" ")}
            >
              {item.step != null && (
                <span
                  className={[
                    "inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded font-mono text-[10px]",
                    active
                      ? "bg-accent-deep text-white"
                      : "bg-subtle text-muted",
                  ].join(" ")}
                >
                  {item.step}
                </span>
              )}
              {item.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <span
          className="inline-block h-3 w-3 rounded-full bg-accent"
          aria-hidden
        />
        <span className="text-base font-bold tracking-tight text-ink">
          옵티파이 워크스페이스
        </span>
      </div>

      <NavList role={role} />

      <div className="border-t border-border px-5 py-3 text-xs text-muted">
        {role === "owner" ? "관리자(owner)" : "멤버(member)"}
      </div>
    </aside>
  );
}
