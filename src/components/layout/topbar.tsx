import { ClientSelector } from "@/components/layout/client-selector";
import { signOut } from "@/lib/actions/auth";

export function Topbar({ userName }: { userName: string }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-6">
      <ClientSelector />

      <div className="flex items-center gap-4">
        <span className="text-sm text-muted">{userName}</span>
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
