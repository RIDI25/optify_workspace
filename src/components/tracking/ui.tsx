"use client";

import type { ReactNode } from "react";

/** 트래커 화면 공용 조각 — 트래커 콘솔(Streamlit)의 metric·info·dataframe 에 대응 */

export function Section({
  title,
  children,
  right,
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  delta,
  caption,
}: {
  label: string;
  value: ReactNode;
  delta?: string | null;
  caption?: string;
}) {
  const up = delta?.startsWith("+");
  const down = delta?.startsWith("-");
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-bold text-ink">{value}</p>
        {delta && (
          <span
            className={[
              "text-xs font-medium",
              up ? "text-blue-700" : down ? "text-red-600" : "text-muted",
            ].join(" ")}
          >
            {delta}
          </span>
        )}
      </div>
      {caption && <p className="mt-1 text-xs text-muted">{caption}</p>}
    </div>
  );
}

export function Notice({
  kind = "info",
  children,
}: {
  kind?: "info" | "success" | "warn" | "error";
  children: ReactNode;
}) {
  const cls = {
    info: "border-accent/30 bg-tint text-ink",
    success: "border-blue-200 bg-blue-50 text-blue-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
  }[kind];
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>
  );
}

export function Chip({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={[
        "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
        active ? "bg-tint text-accent-deep" : "bg-subtle text-muted",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

/** 단순 표. rows 는 셀 배열, header 는 열 이름. */
export function DataTable({
  header,
  rows,
  empty = "없음",
  dense = false,
}: {
  header: string[];
  rows: ReactNode[][];
  empty?: string;
  dense?: boolean;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  const pad = dense ? "px-2 py-1" : "px-3 py-2";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            {header.map((h) => (
              <th key={h} className={`${pad} font-medium`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {r.map((c, j) => (
                <td key={j} className={`${pad} align-top text-ink`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExtLink({ href, children }: { href: string | null; children?: ReactNode }) {
  if (!href) return <span className="text-muted">-</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-all text-accent-deep underline-offset-2 hover:underline"
    >
      {children ?? href}
    </a>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="max-w-full truncate rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
