import Link from "next/link";
import {
  DOW_KO_MON,
  SOURCE_LABELS,
  SOURCE_STYLES,
  buildMonthGrid,
  eventTypeLabel,
  ymdOf,
} from "@/lib/schedule";
import type { CalendarEvent } from "@/types/database";

export interface HomeCalTask {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  assignee_id: string | null;
}

export interface HomeCalInvoice {
  id: string;
  issue_date: string;
  counterparty: string;
}

interface CalItem {
  key: string;
  kind: "event" | "task" | "invoice";
  date: string;
  time: string | null;
  label: string;
  sub: string;
}

/**
 * 홈 최상단 — 이번 달 미니 캘린더 + 오늘 스케줄.
 * 일정 + 업무 마감(완료 제외) + 세금계산서 발행일 병합 (스케줄 페이지와 동일 소스·색).
 * 서버 렌더 — 등록·수정은 /schedule에서.
 */
export function HomeSchedule({
  events,
  tasks,
  invoices,
  profiles,
}: {
  events: CalendarEvent[];
  tasks: HomeCalTask[];
  invoices: HomeCalInvoice[];
  profiles: { id: string; name: string }[];
}) {
  const now = new Date();
  const today = ymdOf(now);
  const nameOf = (id: string | null) =>
    id ? (profiles.find((p) => p.id === id)?.name ?? "") : "";

  const items: CalItem[] = [
    ...events.map((e) => ({
      key: `e-${e.id}`,
      kind: "event" as const,
      date: e.event_date,
      time: e.event_time ? e.event_time.slice(0, 5) : null,
      label: e.title,
      sub: [eventTypeLabel(e.event_type), nameOf(e.assignee_id)]
        .filter(Boolean)
        .join(" · "),
    })),
    ...tasks
      .filter((t) => t.due_date && t.status !== "done")
      .map((t) => ({
        key: `t-${t.id}`,
        kind: "task" as const,
        date: t.due_date as string,
        time: null,
        label: t.title,
        sub: nameOf(t.assignee_id),
      })),
    ...invoices.map((i) => ({
      key: `i-${i.id}`,
      kind: "invoice" as const,
      date: i.issue_date,
      time: null,
      label: `계산서 · ${i.counterparty}`,
      sub: "발행일",
    })),
  ];

  const byDate = new Map<string, CalItem[]>();
  for (const it of items) {
    const list = byDate.get(it.date) ?? [];
    list.push(it);
    byDate.set(it.date, list);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => ((a.time ?? "99") < (b.time ?? "99") ? -1 : 1));
  }

  const weeks = buildMonthGrid(now.getFullYear(), now.getMonth());
  const todayItems = byDate.get(today) ?? [];
  const todayDow = DOW_KO_MON[(now.getDay() + 6) % 7];
  const upcoming = items.filter((it) => it.date > today).length;

  return (
    <section className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      {/* 이번 달 미니 캘린더 */}
      <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">
            {now.getMonth() + 1}월 캘린더
          </h2>
          <div className="flex items-center gap-2">
            <span className="hidden gap-1.5 sm:flex">
              {Object.entries(SOURCE_LABELS).map(([k, label]) => (
                <span
                  key={k}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_STYLES[k]}`}
                >
                  {label}
                </span>
              ))}
            </span>
            <Link
              href="/schedule"
              className="text-xs text-accent-deep hover:underline"
            >
              스케줄 →
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-muted">
          {DOW_KO_MON.map((d) => (
            <div key={d} className="py-1 font-medium">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((date, di) => (
              <div key={di} className="min-h-14 border-t border-border/40 p-1">
                {date && (
                  <Link href="/schedule" className="block">
                    <p
                      className={[
                        "mb-0.5 inline-flex h-4.5 w-4.5 items-center justify-center rounded-full font-mono text-[11px]",
                        date === today
                          ? "bg-accent-deep font-semibold text-white"
                          : "text-muted",
                      ].join(" ")}
                    >
                      {Number(date.slice(8))}
                    </p>
                    {(byDate.get(date) ?? []).slice(0, 2).map((it) => (
                      <p
                        key={it.key}
                        title={it.label}
                        className={[
                          "mb-0.5 truncate rounded px-1 py-px text-[9px] font-medium",
                          SOURCE_STYLES[it.kind],
                        ].join(" ")}
                      >
                        {it.label}
                      </p>
                    ))}
                    {(byDate.get(date)?.length ?? 0) > 2 && (
                      <p className="px-1 text-[9px] text-muted">
                        +{(byDate.get(date)?.length ?? 0) - 2}
                      </p>
                    )}
                  </Link>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 오늘 스케줄 */}
      <div className="rounded-lg border border-accent-deep/30 bg-tint/30 p-4 lg:col-span-2">
        <h2 className="mb-3 text-sm font-semibold text-accent-deep">
          오늘 스케줄 · {now.getMonth() + 1}/{now.getDate()} ({todayDow})
        </h2>
        {todayItems.length === 0 ? (
          <p className="text-sm text-muted">오늘 등록된 일정이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {todayItems.map((it) => (
              <li key={it.key} className="flex items-center gap-2 text-sm">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_STYLES[it.kind]}`}
                >
                  {SOURCE_LABELS[it.kind]}
                </span>
                {it.time && (
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {it.time}
                  </span>
                )}
                <Link
                  href={it.kind === "task" ? "/tasks" : it.kind === "invoice" ? "/revenue" : "/schedule"}
                  className="truncate text-ink hover:text-accent-deep hover:underline"
                >
                  {it.label}
                </Link>
                {it.sub && (
                  <span className="ml-auto shrink-0 text-[11px] text-muted">
                    {it.sub}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {upcoming > 0 && (
          <Link
            href="/schedule"
            className="mt-3 block text-xs text-muted hover:text-accent-deep"
          >
            이번 달 남은 일정 {upcoming}건 → 스케줄에서 보기
          </Link>
        )}
      </div>
    </section>
  );
}
