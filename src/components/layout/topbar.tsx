import { ClientSelector } from "@/components/layout/client-selector";
import { MobileNav } from "@/components/layout/mobile-nav";
import { signOut } from "@/lib/actions/auth";
import type { Role } from "@/types/database";

export function Topbar({ userName, role }: { userName: string; role: Role }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNav role={role} />
        <ClientSelector />
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <span className="hidden text-sm text-muted sm:inline">{userName}</span>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-subtle"
          >
            로그아웃
          </button>
        </form>
      </div>
    </header>
  );
}
