"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import type { Role } from "@/types/database";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-16 items-center gap-2 px-5">
        <span
          className="inline-block h-3 w-3 rounded-full bg-accent"
          aria-hidden
        />
        <span className="text-base font-bold tracking-tight text-ink">
          옵티파이 워크스페이스
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-tint text-accent-deep"
                  : "text-ink hover:bg-subtle",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-5 py-3 text-xs text-muted">
        {role === "owner" ? "관리자(owner)" : "멤버(member)"}
      </div>
    </aside>
  );
}
