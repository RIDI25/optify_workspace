"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, {
  type DateClickArg,
} from "@fullcalendar/interaction";
import type { EventDropArg } from "@fullcalendar/core";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { CHANNELS, getChannel, channelLabel } from "@/lib/channels";
import { PLAN_STATUSES, planStatusLabel } from "@/lib/plan-status";
import {
  deletePlan,
  approveContent,
  addExternalPost,
  updatePlanExternalUrl,
  markPlanPublished,
} from "@/lib/actions/contents";
import {
  ApprovalBadge,
  CommentThread,
} from "@/components/generate/content-result";
import { stripMarkdown } from "@/lib/text";
import type {
  ApprovalStatus,
  ContentPlan,
  PlanStatus,
  Profile,
} from "@/types/database";

interface LinkedContent {
  id: string;
  approval_status: ApprovalStatus;
  title: string | null;
  body: string;
  channel: string;
  created_at: string;
}

function previewText(body: string): string {
  return stripMarkdown(body.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

type View = "calendar" | "list";

export function PlansView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [view, setView] = useState<View>("calendar");
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [keywords, setKeywords] = useState<Record<string, string>>({});
  // plan_id → 연결된 콘텐츠 목록(최신순)
  const [contentsByPlan, setContentsByPlan] = useState<
    Record<string, LinkedContent[]>
  >({});
  const [selected, setSelected] = useState<ContentPlan | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string>("");

  const [fStatus, setFStatus] = useState("");
  const [fChannel, setFChannel] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [delMsg, setDelMsg] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectText, setRejectText] = useState("");
  const [approvalMsg, setApprovalMsg] = useState("");
  const [extOpen, setExtOpen] = useState(false);
  const [extDefaultDate, setExtDefaultDate] = useState<string | null>(null);
  // 캘린더 날짜칸 클릭 → 그 날짜의 콘텐츠·글감 패널
  const [dayDate, setDayDate] = useState<string | null>(null);
  // 상세 패널의 링크 추가/수정 인라인 편집
  const [urlEditing, setUrlEditing] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [urlMsg, setUrlMsg] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .then(({ data }) => setProfiles((data ?? []) as Profile[]));
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setMeId(uid);
      if (uid) {
        supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .single()
          .then(({ data: p }) => setMeRole(p?.role ?? ""));
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedClientId) return;
    const supabase = createClient();
    supabase
      .from("content_plans")
      .select("*")
      .eq("client_id", selectedClientId)
      .then(({ data }) => setPlans((data ?? []) as ContentPlan[]));
    supabase
      .from("keywords")
      .select("id, keyword")
      .eq("client_id", selectedClientId)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const k of (data ?? []) as { id: string; keyword: string }[]) {
          map[k.id] = k.keyword;
        }
        setKeywords(map);
      });
    supabase
      .from("contents")
      .select("id, plan_id, approval_status, title, body, channel, created_at")
      .eq("client_id", selectedClientId)
      .not("plan_id", "is", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const map: Record<string, LinkedContent[]> = {};
        for (const c of (data ?? []) as (LinkedContent & {
          plan_id: string;
        })[]) {
          (map[c.plan_id] ??= []).push(c);
        }
        setContentsByPlan(map);
      });
  }, [selectedClientId]);

  const profileName = (id: string | null) =>
    profiles.find((p) => p.id === id)?.name ?? "-";

  const filtered = useMemo(
    () =>
      plans.filter(
        (p) =>
          (!fStatus || p.status === fStatus) &&
          (!fChannel || p.channel === fChannel) &&
          (!fAssignee || p.assignee === fAssignee),
      ),
    [plans, fStatus, fChannel, fAssignee],
  );

  const events = useMemo(
    () =>
      plans
        .filter((p) => p.scheduled_date)
        .map((p) => ({
          id: p.id,
          title: p.title,
          start: p.scheduled_date!,
          allDay: true,
          backgroundColor: getChannel(p.channel)?.color ?? "#057A4E",
          borderColor: getChannel(p.channel)?.color ?? "#057A4E",
          extendedProps: {
            approval: contentsByPlan[p.id]?.[0]?.approval_status ?? null,
            published: p.status === "published",
          },
        })),
    [plans, contentsByPlan],
  );

  function choose(p: ContentPlan | null) {
    setSelected(p);
    setConfirmDel(false);
    setDelMsg("");
    setRejectOpen(false);
    setRejectText("");
    setApprovalMsg("");
    setUrlEditing(false);
    setUrlDraft("");
    setUrlMsg("");
  }

  async function saveExternalUrl() {
    if (!selected) return;
    const next = urlDraft.trim() || null;
    const r = await updatePlanExternalUrl(selected.id, next);
    if (!r.ok) {
      setUrlMsg(r.error ?? "저장 실패");
      return;
    }
    setPlans((prev) =>
      prev.map((p) => (p.id === selected.id ? { ...p, external_url: next } : p)),
    );
    setSelected((prev) => (prev ? { ...prev, external_url: next } : prev));
    setUrlEditing(false);
    setUrlMsg("");
  }

  async function decideContent(
    contentId: string,
    decision: "approved" | "rejected",
    comment?: string,
  ) {
    const r = await approveContent(contentId, decision, comment);
    if (!r.ok) {
      setApprovalMsg(`실패: ${r.error}`);
      setTimeout(() => setApprovalMsg(""), 2500);
      return;
    }
    // 로컬 뱃지 즉시 반영
    setContentsByPlan((prev) => {
      const next: Record<string, LinkedContent[]> = {};
      for (const [pid, list] of Object.entries(prev)) {
        next[pid] = list.map((c) =>
          c.id === contentId ? { ...c, approval_status: decision } : c,
        );
      }
      return next;
    });
    setApprovalMsg(decision === "approved" ? "승인됨" : "반려됨");
    setRejectOpen(false);
    setRejectText("");
    setTimeout(() => setApprovalMsg(""), 2500);
  }

  async function handleDeletePlan() {
    if (!selected) return;
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    const r = await deletePlan(selected.id);
    if (r.ok) {
      setPlans((prev) => prev.filter((p) => p.id !== selected.id));
      choose(null);
    } else {
      setDelMsg(`삭제 실패: ${r.error}`);
      setConfirmDel(false);
    }
  }

  async function onEventDrop(arg: EventDropArg) {
    const id = arg.event.id;
    const newDate = arg.event.startStr.slice(0, 10);
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, scheduled_date: newDate } : p)),
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("content_plans")
      .update({ scheduled_date: newDate })
      .eq("id", id);
    if (error) arg.revert();
  }

  if (!selectedClientId) {
    return <p className="text-sm text-muted">상단에서 클라이언트를 선택하세요.</p>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">콘텐츠 플랜</h1>
          <p className="mt-1 text-sm text-muted">{selectedClient?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setExtDefaultDate(null);
              setExtOpen(true);
            }}
            className="rounded-md border border-accent-deep px-3 py-1.5 text-sm font-medium text-accent-deep hover:bg-tint"
          >
            + 외부 글 추가 (제목·링크)
          </button>
          <div className="flex rounded-md border border-border">
            {(["calendar", "list"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={[
                  "px-3 py-1.5 text-sm font-medium",
                  view === v ? "bg-tint text-accent-deep" : "text-muted",
                ].join(" ")}
              >
                {v === "calendar" ? "캘린더" : "리스트"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {view === "calendar" ? (
            <div className="rounded-lg border border-border bg-surface p-3 text-sm">
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                locale="ko"
                height="auto"
                editable
                events={events}
                eventDrop={onEventDrop}
                eventContent={(arg) => {
                  const ap = arg.event.extendedProps.approval as
                    | ApprovalStatus
                    | null;
                  const published = !!arg.event.extendedProps.published;
                  const dot =
                    ap === "approved"
                      ? "●"
                      : ap === "rejected"
                        ? "✕"
                        : ap === "pending"
                          ? "○"
                          : "";
                  return (
                    <div
                      className={[
                        "truncate px-1 text-xs text-white",
                        published ? "opacity-70" : "",
                      ].join(" ")}
                    >
                      {published && <span className="mr-1">✅</span>}
                      {!published && dot && <span className="mr-1">{dot}</span>}
                      {arg.event.title}
                    </div>
                  );
                }}
                eventClick={(info) => {
                  const p = plans.find((x) => x.id === info.event.id);
                  if (p) choose(p);
                }}
                dateClick={(arg: DateClickArg) => setDayDate(arg.dateStr)}
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "",
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <FilterSelect
                  value={fStatus}
                  onChange={setFStatus}
                  placeholder="상태"
                  options={PLAN_STATUSES.map((s) => ({
                    value: s.key,
                    label: s.label,
                  }))}
                />
                <FilterSelect
                  value={fChannel}
                  onChange={setFChannel}
                  placeholder="채널"
                  options={CHANNELS.map((c) => ({
                    value: c.key,
                    label: c.label,
                  }))}
                />
                <FilterSelect
                  value={fAssignee}
                  onChange={setFAssignee}
                  placeholder="담당자"
                  options={profiles.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                />
              </div>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-subtle text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">제목</th>
                      <th className="px-3 py-2">채널</th>
                      <th className="px-3 py-2">상태</th>
                      <th className="px-3 py-2">담당</th>
                      <th className="px-3 py-2">예정일</th>
                      <th className="px-3 py-2">승인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => choose(p)}
                        className="cursor-pointer border-t border-border hover:bg-subtle"
                      >
                        <td className="px-3 py-2 font-medium text-ink">
                          {p.title}
                          {p.external_url && (
                            <span className="ml-1 text-xs" title="외부 작성 글">
                              🔗
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {channelLabel(p.channel)}
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {planStatusLabel(p.status)}
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {profileName(p.assignee)}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted">
                          {p.scheduled_date ?? "-"}
                        </td>
                        <td className="px-3 py-2">
                          {contentsByPlan[p.id]?.[0] ? (
                            <ApprovalBadge
                              status={contentsByPlan[p.id][0].approval_status}
                            />
                          ) : (
                            <span className="text-xs text-muted">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-muted">
                          플랜이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 플랜 상세 */}
        <div>
          {selected ? (
            <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between">
                <h2 className="text-base font-bold text-ink">{selected.title}</h2>
                <button
                  onClick={() => choose(null)}
                  className="text-xs text-muted hover:text-ink"
                >
                  닫기
                </button>
              </div>
              <dl className="space-y-1.5 text-sm">
                <Row label="채널" value={channelLabel(selected.channel)} />
                <Row label="상태" value={planStatusLabel(selected.status)} />
                <Row label="담당자" value={profileName(selected.assignee)} />
                <Row label="예정일" value={selected.scheduled_date ?? "-"} />
                {selected.keyword_id && (
                  <Row
                    label="연결 키워드"
                    value={keywords[selected.keyword_id] ?? "-"}
                  />
                )}
              </dl>
              {selected.memo && (
                <p className="rounded-md bg-subtle p-2 text-sm text-ink">
                  {selected.memo}
                </p>
              )}

              {/* 외부 작성 글 링크 */}
              <div className="space-y-1.5">
                {selected.external_url && !urlEditing && (
                  <a
                    href={selected.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate rounded-md bg-tint px-3 py-2 text-sm font-medium text-accent-deep hover:underline"
                    title={selected.external_url}
                  >
                    🔗 작성한 글 보기
                  </a>
                )}
                {urlEditing ? (
                  <div className="space-y-1">
                    <input
                      value={urlDraft}
                      onChange={(e) => setUrlDraft(e.target.value)}
                      placeholder="https://…"
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent-deep"
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={saveExternalUrl}
                        className="rounded-md bg-accent-deep px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => {
                          setUrlEditing(false);
                          setUrlMsg("");
                        }}
                        className="rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:bg-subtle"
                      >
                        취소
                      </button>
                    </div>
                    {urlMsg && <p className="text-xs text-red-600">{urlMsg}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setUrlDraft(selected.external_url ?? "");
                      setUrlEditing(true);
                    }}
                    className="text-xs text-muted hover:text-accent-deep hover:underline"
                  >
                    {selected.external_url ? "링크 수정" : "+ 글 링크 추가"}
                  </button>
                )}
              </div>
              {(() => {
                const linkedKeyword = selected.keyword_id
                  ? keywords[selected.keyword_id]
                  : undefined;
                const genHref =
                  `/generate?planId=${selected.id}&channel=${selected.channel}&title=${encodeURIComponent(selected.title)}` +
                  (linkedKeyword
                    ? `&keyword=${encodeURIComponent(linkedKeyword)}`
                    : "");
                const list = contentsByPlan[selected.id] ?? [];
                const latest = list[0];
                if (latest) {
                  return (
                    <div className="space-y-2">
                      <Link
                        href={`/library?contentId=${latest.id}`}
                        className="block rounded-md bg-accent px-3 py-2 text-center text-sm font-semibold text-ink hover:opacity-90"
                      >
                        생성물 보기
                      </Link>
                      <NewGenLink href={genHref} />
                    </div>
                  );
                }
                return (
                  <Link
                    href={genHref}
                    className="block rounded-md bg-accent px-3 py-2 text-center text-sm font-semibold text-ink hover:opacity-90"
                  >
                    이 플랜으로 생성
                  </Link>
                );
              })()}

              {/* 연결된 생성물 — 승인/코멘트 [Fix 2] */}
              {(() => {
                const list = contentsByPlan[selected.id] ?? [];
                const latest = list[0];
                if (!latest) return null;
                const approved = latest.approval_status === "approved";
                return (
                  <div className="space-y-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink">
                        연결된 생성물
                      </h3>
                      <ApprovalBadge status={latest.approval_status} />
                    </div>
                    <p className="text-sm font-medium text-ink">
                      {latest.title || "(제목 없음)"}
                    </p>
                    <p className="line-clamp-4 rounded-md bg-subtle p-2 text-xs text-muted">
                      {previewText(latest.body)}…
                    </p>

                    {meRole === "owner" && !approved && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => decideContent(latest.id, "approved")}
                          className="flex-1 rounded-md bg-accent-deep px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                        >
                          승인
                        </button>
                        <button
                          onClick={() => setRejectOpen(true)}
                          className="flex-1 rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          반려
                        </button>
                      </div>
                    )}
                    {meRole === "owner" && approved && (
                      <button
                        onClick={() => setRejectOpen(true)}
                        className="w-full rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:bg-subtle"
                      >
                        승인 취소(반려)
                      </button>
                    )}
                    {approvalMsg && (
                      <p className="text-xs text-muted">{approvalMsg}</p>
                    )}

                    {list.length > 1 && (
                      <details className="text-xs text-muted">
                        <summary className="cursor-pointer">
                          이전 생성물 {list.length - 1}건
                        </summary>
                        <ul className="mt-1 space-y-1">
                          {list.slice(1).map((c) => (
                            <li key={c.id}>
                              <Link
                                href={`/library?contentId=${c.id}`}
                                className="hover:text-accent-deep hover:underline"
                              >
                                {c.title || "(제목 없음)"} ·{" "}
                                {c.created_at.slice(0, 10)}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    <CommentThread contentId={latest.id} meId={meId} />
                  </div>
                );
              })()}

              {/* 플랜 삭제 */}
              <div className="space-y-1 border-t border-border pt-3">
                {contentsByPlan[selected.id]?.[0] && !confirmDel && (
                  <p className="text-xs text-muted">
                    연결된 생성물이 있습니다. 플랜만 삭제되고 생성물은
                    라이브러리에 남습니다.
                  </p>
                )}
                <button
                  onClick={handleDeletePlan}
                  className={[
                    "w-full rounded-md border px-3 py-2 text-sm font-medium",
                    confirmDel
                      ? "border-red-500 bg-red-50 text-red-600"
                      : "border-border text-muted hover:bg-subtle",
                  ].join(" ")}
                >
                  {confirmDel
                    ? "정말 삭제할까요? (다시 클릭)"
                    : "플랜 삭제"}
                </button>
                {confirmDel && (
                  <button
                    onClick={() => setConfirmDel(false)}
                    className="w-full px-3 py-1 text-xs text-muted hover:text-ink"
                  >
                    취소
                  </button>
                )}
                {delMsg && <p className="text-xs text-red-600">{delMsg}</p>}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
              플랜을 선택하면 상세가 표시됩니다.
            </div>
          )}
        </div>
      </div>

      {/* 날짜칸 클릭 — 그 날짜의 콘텐츠·글감 패널 */}
      {dayDate && (
        <DayPanel
          date={dayDate}
          plans={plans.filter((p) => p.scheduled_date === dayDate)}
          contentsByPlan={contentsByPlan}
          keywords={keywords}
          onClose={() => setDayDate(null)}
          onDeleted={(planId) => {
            setPlans((prev) => prev.filter((p) => p.id !== planId));
            if (selected?.id === planId) choose(null);
          }}
          onStatusChanged={(planId, status) => {
            setPlans((prev) =>
              prev.map((p) => (p.id === planId ? { ...p, status } : p)),
            );
            setSelected((prev) =>
              prev && prev.id === planId ? { ...prev, status } : prev,
            );
          }}
          onAddExternal={() => {
            setExtDefaultDate(dayDate);
            setDayDate(null);
            setExtOpen(true);
          }}
        />
      )}

      {/* 외부 작성 글 추가 모달 */}
      {extOpen && (
        <ExternalPostModal
          clientId={selectedClientId}
          defaultDate={extDefaultDate}
          onClose={() => setExtOpen(false)}
          onCreated={(plan) => {
            setPlans((prev) => [plan, ...prev]);
            setExtOpen(false);
            choose(plan);
          }}
        />
      )}

      {/* 반려 사유 모달 [Fix 2] */}
      {rejectOpen && selected && contentsByPlan[selected.id]?.[0] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-surface p-5 shadow-lg">
            <h3 className="text-base font-bold text-ink">반려 사유</h3>
            <textarea
              value={rejectText}
              onChange={(e) => setRejectText(e.target.value)}
              rows={4}
              placeholder="수정이 필요한 부분을 코멘트로 남겨주세요."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRejectOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-subtle"
              >
                취소
              </button>
              <button
                onClick={() =>
                  decideContent(
                    contentsByPlan[selected.id][0].id,
                    "rejected",
                    rejectText,
                  )
                }
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                반려 확정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 캘린더 날짜칸 클릭 시 그 날짜의 콘텐츠·글감 목록 + 글쓰기/발행/삭제 액션 패널 */
function DayPanel({
  date,
  plans,
  contentsByPlan,
  keywords,
  onClose,
  onDeleted,
  onStatusChanged,
  onAddExternal,
}: {
  date: string;
  plans: ContentPlan[];
  contentsByPlan: Record<string, LinkedContent[]>;
  keywords: Record<string, string>;
  onClose: () => void;
  onDeleted: (planId: string) => void;
  onStatusChanged: (planId: string, status: PlanStatus) => void;
  onAddExternal: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const contents = plans.filter(
    (p) => contentsByPlan[p.id]?.[0] || p.external_url,
  );
  const drafts = plans.filter(
    (p) => !contentsByPlan[p.id]?.[0] && !p.external_url,
  );

  async function setPublished(plan: ContentPlan, publish: boolean) {
    if (publish === (plan.status === "published")) return;
    setBusyId(plan.id);
    setMsg("");
    const r = await markPlanPublished(plan.id, publish);
    setBusyId(null);
    if (r.ok && r.status) onStatusChanged(plan.id, r.status);
    else setMsg(`실패: ${r.error ?? "알 수 없는 오류"}`);
  }

  async function remove(plan: ContentPlan) {
    if (confirmId !== plan.id) {
      setConfirmId(plan.id);
      return;
    }
    setBusyId(plan.id);
    const r = await deletePlan(plan.id);
    setBusyId(null);
    setConfirmId(null);
    if (r.ok) onDeleted(plan.id);
    else setMsg(`삭제 실패: ${r.error}`);
  }

  function renderItem(p: ContentPlan, isDraft: boolean) {
    const linked = contentsByPlan[p.id]?.[0] ?? null;
    const isPublished = p.status === "published";
    const linkedKeyword = p.keyword_id ? keywords[p.keyword_id] : undefined;
    const genHref =
      `/generate?planId=${p.id}&channel=${p.channel}&title=${encodeURIComponent(p.title)}` +
      (linkedKeyword ? `&keyword=${encodeURIComponent(linkedKeyword)}` : "");
    return (
      <li
        key={p.id}
        className="space-y-2.5 rounded-lg border border-border bg-surface p-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {p.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                style={{
                  backgroundColor: getChannel(p.channel)?.color ?? "#057A4E",
                }}
              >
                {channelLabel(p.channel)}
              </span>
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  isPublished
                    ? "bg-tint text-accent-deep"
                    : "bg-subtle text-muted",
                ].join(" ")}
              >
                {isPublished ? "✅ 발행됨" : `⏳ ${planStatusLabel(p.status)}`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isDraft && (
            <Link
              href={genHref}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-ink hover:opacity-90"
            >
              ✍️ 글쓰기
            </Link>
          )}
          {linked && (
            <Link
              href={`/library?contentId=${linked.id}`}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-subtle"
            >
              생성물 보기
            </Link>
          )}
          {p.external_url && (
            <a
              href={p.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-subtle"
            >
              🔗 글 보기
            </a>
          )}
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              onClick={() => setPublished(p, true)}
              disabled={busyId === p.id}
              className={[
                "px-3 py-1.5 text-xs font-medium disabled:opacity-50",
                isPublished
                  ? "bg-accent-deep text-white"
                  : "text-muted hover:bg-subtle",
              ].join(" ")}
            >
              발행 완료
            </button>
            <button
              onClick={() => setPublished(p, false)}
              disabled={busyId === p.id}
              className={[
                "border-l border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50",
                !isPublished
                  ? "bg-ink text-white"
                  : "text-muted hover:bg-subtle",
              ].join(" ")}
            >
              대기중
            </button>
          </div>
          <button
            onClick={() => remove(p)}
            disabled={busyId === p.id}
            className={[
              "ml-auto rounded-md border px-3 py-1.5 text-xs disabled:opacity-50",
              confirmId === p.id
                ? "border-red-500 bg-red-50 font-medium text-red-600"
                : "border-border text-muted hover:bg-subtle",
            ].join(" ")}
          >
            {confirmId === p.id ? "정말 삭제?" : "삭제"}
          </button>
          {confirmId === p.id && (
            <button
              onClick={() => setConfirmId(null)}
              className="px-1 py-1 text-xs text-muted hover:text-ink"
            >
              취소
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-ink">📅 {date}</h3>
          <button onClick={onClose} className="text-xs text-muted hover:text-ink">
            닫기 ✕
          </button>
        </div>

        {plans.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">
            이 날짜에 예정된 콘텐츠·글감이 없습니다.
          </p>
        )}

        {contents.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted">
              생성 완료 콘텐츠 ({contents.length})
            </h4>
            <ul className="space-y-2">
              {contents.map((p) => renderItem(p, false))}
            </ul>
          </div>
        )}

        {drafts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted">
              글감 ({drafts.length})
            </h4>
            <ul className="space-y-2">{drafts.map((p) => renderItem(p, true))}</ul>
          </div>
        )}

        {msg && <p className="text-xs text-red-600">{msg}</p>}

        <button
          onClick={onAddExternal}
          className="w-full rounded-md border border-dashed border-accent-deep px-3 py-2 text-sm font-medium text-accent-deep hover:bg-tint"
        >
          + 이 날짜에 외부 작성 글 추가 (제목·링크)
        </button>
      </div>
    </div>
  );
}

/** 생성 엔진 밖에서 따로 작성·발행한 글을 제목+링크로 플랜에 등록하는 모달 */
function ExternalPostModal({
  clientId,
  defaultDate,
  onClose,
  onCreated,
}: {
  clientId: string;
  defaultDate?: string | null;
  onClose: () => void;
  onCreated: (plan: ContentPlan) => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [channel, setChannel] = useState(CHANNELS[0]?.key ?? "");
  const [status, setStatus] = useState("published");
  const [date, setDate] = useState(defaultDate ?? "");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    if (saving) return;
    setSaving(true);
    setMsg("");
    const r = await addExternalPost({
      clientId,
      title,
      url,
      channel,
      status: status as ContentPlan["status"],
      scheduledDate: date || null,
      memo: memo || null,
    });
    setSaving(false);
    if (!r.ok || !r.plan) {
      setMsg(r.error ?? "저장 실패");
      return;
    }
    onCreated(r.plan);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-surface p-5 shadow-lg">
        <h3 className="text-base font-bold text-ink">외부 작성 글 추가</h3>
        <p className="text-xs text-muted">
          따로 작성한 글의 제목과 링크를 플랜에 등록합니다.
        </p>
        <div className="space-y-2 text-sm">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="글 제목 *"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent-deep"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="글 링크 (https://…) *"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent-deep"
          />
          <div className="flex gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="flex-1 rounded-md border border-border bg-surface px-2 py-2"
            >
              {CHANNELS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex-1 rounded-md border border-border bg-surface px-2 py-2"
            >
              {PLAN_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs"
          />
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            placeholder="메모 (선택)"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent-deep"
          />
        </div>
        {msg && <p className="text-xs text-red-600">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-subtle"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-accent-deep px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "저장 중…" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewGenLink({ href }: { href: string }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Link
      href={confirm ? href : "#"}
      onClick={(e) => {
        if (!confirm) {
          e.preventDefault();
          setConfirm(true);
        }
      }}
      className="block rounded-md border border-border px-3 py-2 text-center text-sm text-muted hover:bg-subtle"
    >
      {confirm ? "이미 생성된 콘텐츠가 있습니다. 새로 생성할까요?" : "새로 생성"}
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
    >
      <option value="">{placeholder} (전체)</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
