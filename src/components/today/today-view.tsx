"use client";

import Link from "next/link";
import { useState } from "react";

export type TodayTone = "bad" | "warn" | "info" | "muted";
export type TodayGroup = "review" | "publish" | "task" | "lead" | "invoice" | "contract";

export interface TodayRow {
  key: string;
  group: TodayGroup;
  clientId: string | null;
  clientName: string;
  title: string;
  badge?: string;
  tone: TodayTone;
  action: { label: string; href: string };
  /** 'YYYY-MM-DD' 또는 null */
  due: string | null;
  dueLabel: string;
  assigneeId: string | null;
  assignee: string;
}

export interface TodayEvent {
  key: string;
  date: string;
  time: string | null;
  title: string;
  kind: string;
}

export interface TodayClientSummary {
  id: string;
  name: string;
  isInternal: boolean;
  generated: number;
  published: number;
  pending: number;
  overdue: number;
}

const GROUP_LABELS: Record<TodayGroup, string> = {
  review: "검수·수정",
  publish: "발행",
  task: "업무",
  lead: "영업",
  invoice: "정산",
  contract: "계약",
};

const TONE_CLS: Record<TodayTone, string> = {
  bad: "bg-red-50 text-red-700",
  warn: "bg-amber-50 text-amber-800",
  info: "bg-tint text-accent-deep",
  muted: "bg-subtle text-muted",
};

function fmtDate(ymd: string): string {
  return ymd.slice(5).replace("-", "/");
}

/** 오늘 처리할 일 — 한 표, 행마다 다음 행동. 필터는 '내 담당만'과 종류. */
export function TodayView({
  rows,
  events,
  clients,
  me,
  today,
  ym,
}: {
  rows: TodayRow[];
  events: TodayEvent[];
  clients: TodayClientSummary[];
  me: { id: string; name: string };
  today: string;
  ym: string;
}) {
  const [mine, setMine] = useState(false);
  const [group, setGroup] = useState<TodayGroup | "all">("all");

  const visible = rows.filter((r) => (mine ? r.assigneeId === me.id : true)).filter((r) => (group === "all" ? true : r.group === group));
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.group] = (acc[r.group] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">오늘 처리할 일</h1>
          <p className="mt-1 text-sm text-muted">
            {me.name}님 · {today} · 지금 손대야 하는 일 {rows.length}건
          </p>
        </div>
        <button
          onClick={() => setMine((v) => !v)}
          className={[
            "rounded-full border px-3 py-1 text-sm",
            mine ? "border-accent bg-tint font-semibold text-accent-deep" : "border-border text-muted hover:text-ink",
          ].join(" ")}
        >
          내 담당만
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={group === "all"} onClick={() => setGroup("all")} label={`전체 ${rows.length}`} />
        {(Object.keys(GROUP_LABELS) as TodayGroup[]).map((g) => (
          <FilterChip key={g} active={group === g} onClick={() => setGroup(g)} label={`${GROUP_LABELS[g]} ${counts[g] ?? 0}`} />
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            {rows.length === 0 ? "오늘 처리할 일이 없습니다. 고객사 카드에서 다음 작업을 확인하세요." : "이 조건에 맞는 일이 없습니다."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] text-muted">
                  <th className="px-3 py-2 font-medium">고객사</th>
                  <th className="px-3 py-2 font-medium">작업</th>
                  <th className="px-3 py-2 font-medium">필요한 행동</th>
                  <th className="px-3 py-2 font-medium">마감</th>
                  <th className="px-3 py-2 font-medium">담당</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.key} className="border-b border-border/70 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-ink">
                      {r.clientId ? (
                        <Link href={`/clients/${r.clientId}/overview`} className="hover:underline">
                          {r.clientName}
                        </Link>
                      ) : (
                        r.clientName
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink">
                      <span className="font-medium">{r.title}</span>
                      {r.badge && <span className={["ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE_CLS[r.tone]].join(" ")}>{r.badge}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link
                        href={r.action.href}
                        className={[
                          "inline-block rounded-md border px-2.5 py-1 text-xs font-semibold",
                          r.tone === "bad" || r.tone === "warn" ? "border-accent bg-accent text-white hover:opacity-90" : "border-accent text-accent-deep hover:bg-tint",
                        ].join(" ")}
                      >
                        {r.action.label}
                      </Link>
                    </td>
                    <td className={["whitespace-nowrap px-3 py-2 font-mono text-xs", r.tone === "bad" ? "text-red-600" : "text-muted"].join(" ")}>{r.dueLabel}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{r.assignee || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">가까운 일정 (7일)</h2>
            <Link href="/schedule" className="text-xs text-accent-deep hover:underline">
              일정 전체 →
            </Link>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-muted">예정된 일정이 없습니다.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {events.map((e) => (
                <li key={e.key} className="flex gap-2">
                  <span className="w-20 shrink-0 font-mono text-xs text-muted">
                    {fmtDate(e.date)}
                    {e.time ? ` ${e.time.slice(0, 5)}` : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">{e.title}</span>
                  <span className="shrink-0 text-[11px] text-muted">{e.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">이번 달 고객사 한눈에 ({ym})</h2>
            <Link href="/clients" className="text-xs text-accent-deep hover:underline">
              고객사 →
            </Link>
          </div>
          {clients.length === 0 ? (
            <p className="text-sm text-muted">고객사가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {clients.map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-1.5">
                  <Link href={`/clients/${c.id}/overview`} className="min-w-0 flex-1 truncate font-medium text-ink hover:underline">
                    {c.name}
                    {c.isInternal && <span className="ml-1 text-[10px] text-muted">내부</span>}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">
                    발행 {c.published} · 생성 {c.generated}
                    {c.pending ? <span className="ml-1 text-amber-700">· 검수 {c.pending}</span> : null}
                    {c.overdue ? <span className="ml-1 text-red-600">· 지연 {c.overdue}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs",
        active ? "border-accent bg-tint font-semibold text-accent-deep" : "border-border text-muted hover:text-ink",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
