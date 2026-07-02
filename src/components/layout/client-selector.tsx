"use client";

import { useClientContext } from "@/components/providers/client-context";

export function ClientSelector() {
  const { clients, selectedClientId, setSelectedClientId, loading } =
    useClientContext();

  if (loading) {
    return (
      <div className="h-9 w-44 animate-pulse rounded-md bg-subtle" aria-hidden />
    );
  }

  if (clients.length === 0) {
    return (
      <span className="text-sm text-muted">
        클라이언트 없음 — 시드/마이그레이션 실행 필요
      </span>
    );
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">클라이언트</span>
      <select
        value={selectedClientId ?? ""}
        onChange={(e) => setSelectedClientId(e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink outline-none focus:border-accent-deep"
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.is_internal ? " (내부)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
