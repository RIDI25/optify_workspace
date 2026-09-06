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

/** 점 색 — 잔잔하게. 지연만 붉은 점, 나머지는 노랑·파랑·회색 */
const DOT: Record<TodayTone, string> = {
  bad: "bg-red-400",
  warn: "bg-amber-400",
  info: "bg-accent",
  muted: "bg-border",
};

/**
 * 오늘 할 일 — 캘린더 옆의 작은 메모. 한 줄씩 보이고, 누르면 그 아래에 세부 내용과 행동 버튼이 펼쳐진다.
 */
export function TodayMemo({ rows, me }: { rows: TodayRow[]; me: { id: string; name: string } }) {
  const [open, setOpen] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const visible = rows.filter((r) => (mine ? r.assigneeId === me.id : true));
  const overdue = rows.filter((r) => r.tone === "bad").length;

  return (
    <section className="rounded-lg border border-border bg-[#fffdf5] p-4 dark:bg-surface">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          오늘 할 일 <span className="ml-1 font-normal text-muted">{visible.length}건</span>
        </h2>
        <button
          onClick={() => setMine((v) => !v)}
          className={["rounded-full border px-2 py-0.5 text-[11px]", mine ? "border-accent bg-tint text-accent-deep" : "border-border text-muted hover:text-ink"].join(" ")}
        >
          내 담당만
        </button>
      </div>
      {overdue > 0 && !mine && <p className="mb-2 text-[11px] text-muted">이 중 {overdue}건은 예정일이 지났습니다. 천천히 하나씩 처리하면 됩니다.</p>}

      {visible.length === 0 ? (
        <p className="text-sm text-muted">지금 손댈 일이 없습니다. 고객사 카드에서 다음 작업을 확인하세요.</p>
      ) : (
        <ul className="space-y-0.5">
          {visible.map((r) => {
            const isOpen = open === r.key;
            return (
              <li key={r.key} className="rounded-md">
                <button
                  onClick={() => setOpen(isOpen ? null : r.key)}
                  aria-expanded={isOpen}
                  className={["flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-black/[.03]", isOpen ? "bg-black/[.03]" : ""].join(" ")}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[r.tone]}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-ink">
                    <span className="text-muted">{r.clientName} · </span>
                    {r.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{GROUP_LABELS[r.group]}</span>
                </button>
                {isOpen && (
                  <div className="ml-5 mr-1 mb-1 rounded-md border border-border bg-surface px-3 py-2 text-xs">
                    <dl className="grid grid-cols-[52px_1fr] gap-x-2 gap-y-0.5 text-muted">
                      <dt>고객사</dt>
                      <dd className="text-ink">
                        {r.clientId ? (
                          <Link href={`/clients/${r.clientId}/overview`} className="hover:underline">
                            {r.clientName}
                          </Link>
                        ) : (
                          r.clientName
                        )}
                      </dd>
                      <dt>상태</dt>
                      <dd className="text-ink">{r.badge ?? GROUP_LABELS[r.group]}</dd>
                      <dt>마감</dt>
                      <dd className="font-mono text-ink">{r.dueLabel}</dd>
                      <dt>담당</dt>
                      <dd className="text-ink">{r.assignee || "—"}</dd>
                    </dl>
                    <Link href={r.action.href} className="mt-2 inline-block rounded-md border border-accent px-2.5 py-1 text-xs font-semibold text-accent-deep hover:bg-tint">
                      {r.action.label}
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** 이번 달 고객사 한눈에 — 캘린더 아래 작은 표 */
export function ClientsGlance({ clients, ym }: { clients: TodayClientSummary[]; ym: string }) {
  return (
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
  );
}
