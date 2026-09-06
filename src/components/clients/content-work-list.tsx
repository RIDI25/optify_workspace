"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { channelLabel } from "@/lib/channels";
import { clientPath } from "@/lib/nav";

/** 다섯 상태 (2026-09-06 결정: 심플하게) — 새 DB 상태를 만들지 않고 플랜·승인·발행 값으로 계산한다 */
export type WorkState = "planning" | "review" | "fix" | "ready" | "published";
export const WORK_STATES: { key: WorkState; label: string; cls: string; hint: string }[] = [
  { key: "planning", label: "기획 중", cls: "bg-subtle text-muted", hint: "플랜만 있고 글이 없음" },
  { key: "review", label: "검수 필요", cls: "bg-amber-50 text-amber-800", hint: "글이 있고 아직 승인 전" },
  { key: "fix", label: "수정 필요", cls: "bg-red-50 text-red-700", hint: "반려됐거나 승인 뒤 본문이 바뀜" },
  { key: "ready", label: "발행 준비", cls: "bg-tint text-accent-deep", hint: "승인됨, 아직 발행 기록 없음" },
  { key: "published", label: "발행 완료", cls: "bg-emerald-50 text-emerald-700", hint: "발행 완료로 기록됨" },
];

type PlanRow = { id: string; title: string; channel: string; status: string; scheduled_date: string | null; assignee: string | null; external_url: string | null; created_at: string };
type ContentRow = {
  id: string;
  plan_id: string | null;
  title: string | null;
  channel: string;
  approval_status: string;
  published_at: string | null;
  wp_post_id: number | null;
  created_by: string | null;
  created_at: string;
};

export interface WorkItem {
  key: string;
  state: WorkState;
  title: string;
  channel: string;
  planId: string | null;
  contentId: string | null;
  scheduled: string | null;
  assigneeId: string | null;
  wpDraft: boolean;
  externalUrl: string | null;
  sortDate: string;
}

/** 플랜 + 글 → 작업 한 줄. 플랜 없는 글도 한 줄이 된다. */
export function buildWorkItems(plans: PlanRow[], contents: ContentRow[]): WorkItem[] {
  const byPlan = new Map<string, ContentRow[]>();
  for (const c of contents) {
    if (!c.plan_id) continue;
    const list = byPlan.get(c.plan_id) ?? [];
    list.push(c);
    byPlan.set(c.plan_id, list);
  }
  const stateOf = (c: ContentRow | null, plan: PlanRow | null): WorkState => {
    if (c?.published_at) return "published";
    if (!c) return plan?.status === "published" ? "published" : "planning";
    if (c.approval_status === "rejected") return "fix";
    if (c.approval_status === "approved") return "ready";
    return "review";
  };
  const items: WorkItem[] = [];
  for (const p of plans) {
    const linked = (byPlan.get(p.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const c = linked[0] ?? null;
    items.push({
      key: `plan-${p.id}`,
      state: stateOf(c, p),
      title: p.title,
      channel: p.channel,
      planId: p.id,
      contentId: c?.id ?? null,
      scheduled: p.scheduled_date,
      assigneeId: p.assignee ?? c?.created_by ?? null,
      wpDraft: !!c?.wp_post_id && !c?.published_at,
      externalUrl: p.external_url,
      sortDate: p.scheduled_date ?? p.created_at.slice(0, 10),
    });
  }
  for (const c of contents) {
    if (c.plan_id && plans.some((p) => p.id === c.plan_id)) continue;
    items.push({
      key: `content-${c.id}`,
      state: stateOf(c, null),
      title: c.title || "(제목 없음)",
      channel: c.channel,
      planId: null,
      contentId: c.id,
      scheduled: null,
      assigneeId: c.created_by,
      wpDraft: !!c.wp_post_id && !c.published_at,
      externalUrl: null,
      sortDate: c.created_at.slice(0, 10),
    });
  }
  const order: Record<WorkState, number> = { fix: 0, review: 1, ready: 2, planning: 3, published: 4 };
  return items.sort((a, b) => order[a.state] - order[b.state] || b.sortDate.localeCompare(a.sortDate));
}

/** 상태별 다음 행동 (2인 모두 같은 권한이라 하나로) */
export function nextAction(clientId: string, it: WorkItem): { label: string; href: string } {
  const lib = (id: string) => clientPath(clientId, "content", `view=library&contentId=${id}`);
  switch (it.state) {
    case "planning":
      return it.planId
        ? { label: "글 만들기", href: clientPath(clientId, "content", `view=generate&planId=${it.planId}&channel=${encodeURIComponent(it.channel)}&title=${encodeURIComponent(it.title)}`) }
        : { label: "글 만들기", href: clientPath(clientId, "content", "view=generate") };
    case "review":
      return { label: "검수하기", href: lib(it.contentId!) };
    case "fix":
      return { label: "수정하기", href: lib(it.contentId!) };
    case "ready":
      return { label: "발행 기록", href: lib(it.contentId!) };
    case "published":
      return it.externalUrl && !it.contentId ? { label: "링크 열기", href: it.externalUrl } : { label: "결과 보기", href: it.contentId ? lib(it.contentId) : clientPath(clientId, "content", "view=plans") };
  }
}

/** 고객사 › 콘텐츠 › 작업 — 한 작업 목록 + 다음 행동 */
export function ContentWorkList({ clientId }: { clientId: string }) {
  const [data, setData] = useState<{ id: string; plans: PlanRow[]; contents: ContentRow[]; profiles: { id: string; name: string }[]; error: string | null } | null>(null);
  const [filter, setFilter] = useState<WorkState | "all">("all");

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("content_plans").select("id, title, channel, status, scheduled_date, assignee, external_url, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(500),
      supabase
        .from("contents")
        .select("id, plan_id, title, channel, approval_status, published_at, wp_post_id, created_by, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("profiles").select("id, name"),
    ]).then(([p, c, pr]) => {
      if (!active) return;
      setData({
        id: clientId,
        plans: (p.data ?? []) as PlanRow[],
        contents: (c.data ?? []) as ContentRow[],
        profiles: (pr.data ?? []) as { id: string; name: string }[],
        error: p.error?.message ?? c.error?.message ?? null,
      });
    });
    return () => {
      active = false;
    };
  }, [clientId]);

  const loaded = data?.id === clientId ? data : null;
  if (!loaded) return <p className="text-sm text-muted">불러오는 중…</p>;
  if (loaded.error) return <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">불러오지 못했습니다: {loaded.error}</p>;

  const items = buildWorkItems(loaded.plans, loaded.contents);
  const counts = items.reduce<Record<string, number>>((acc, it) => ((acc[it.state] = (acc[it.state] ?? 0) + 1), acc), {});
  const visible = filter === "all" ? items.filter((i) => i.state !== "published").concat(items.filter((i) => i.state === "published").slice(0, 10)) : items.filter((i) => i.state === filter);
  const nameOf = (id: string | null) => loaded.profiles.find((p) => p.id === id)?.name ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={filter === "all"} onClick={() => setFilter("all")} label={`진행 중 ${items.filter((i) => i.state !== "published").length}`} />
          {WORK_STATES.map((s) => (
            <Chip key={s.key} active={filter === s.key} onClick={() => setFilter(s.key)} label={`${s.label} ${counts[s.key] ?? 0}`} title={s.hint} />
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Link href={clientPath(clientId, "content", "view=keywords")} className="rounded-md border border-border px-2.5 py-1.5 text-xs text-ink hover:bg-subtle">
            키워드 리서치
          </Link>
          <Link href={clientPath(clientId, "content", "view=plans")} className="rounded-md border border-border px-2.5 py-1.5 text-xs text-ink hover:bg-subtle">
            플랜 · 외부 글 등록
          </Link>
          <Link href={clientPath(clientId, "content", "view=generate")} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            + 글 만들기
          </Link>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted">
          {items.length === 0 ? "아직 작업이 없습니다. 키워드 리서치에서 주제를 고르거나 바로 글을 만들어 보세요." : "이 상태의 작업이 없습니다."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted">
                <th className="px-3 py-2 font-medium">제목</th>
                <th className="px-3 py-2 font-medium">채널</th>
                <th className="px-3 py-2 font-medium">담당</th>
                <th className="px-3 py-2 font-medium">예정일</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">다음 행동</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((it) => {
                const st = WORK_STATES.find((s) => s.key === it.state)!;
                const act = nextAction(clientId, it);
                return (
                  <tr key={it.key} className="border-b border-border/70 last:border-0">
                    <td className="max-w-md px-3 py-2">
                      <span className="block truncate font-medium text-ink" title={it.title}>
                        {it.title}
                      </span>
                      {!it.contentId && it.externalUrl && <span className="text-[11px] text-muted">외부 작성 · 링크만</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{channelLabel(it.channel)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{nameOf(it.assigneeId) || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted">{it.scheduled ? it.scheduled.slice(5).replace("-", "/") : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                      {it.wpDraft && <span className="ml-1 rounded-full bg-subtle px-2 py-0.5 text-[11px] text-muted">WP 초안 전송됨</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {act.href.startsWith("http") ? (
                        <a href={act.href} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2.5 py-1 text-xs text-ink hover:bg-subtle">
                          {act.label}
                        </a>
                      ) : (
                        <Link
                          href={act.href}
                          className={[
                            "rounded-md border px-2.5 py-1 text-xs font-semibold",
                            it.state === "published" ? "border-border text-ink hover:bg-subtle" : "border-accent text-accent-deep hover:bg-tint",
                          ].join(" ")}
                        >
                          {act.label}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        발행 완료는 최근 10건만 보입니다. 전체는 &lsquo;발행 완료&rsquo; 필터로. WP 초안 전송은 공개 발행이 아니라 별도 표시입니다.
      </p>
    </div>
  );
}

function Chip({ active, onClick, label, title }: { active: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={["rounded-full border px-3 py-1 text-xs", active ? "border-accent bg-tint font-semibold text-accent-deep" : "border-border text-muted hover:text-ink"].join(" ")}
    >
      {label}
    </button>
  );
}
