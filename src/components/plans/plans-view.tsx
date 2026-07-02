"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventDropArg } from "@fullcalendar/core";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { CHANNELS, getChannel, channelLabel } from "@/lib/channels";
import { PLAN_STATUSES, planStatusLabel } from "@/lib/plan-status";
import type { ContentPlan, Profile } from "@/types/database";

type View = "calendar" | "list";

export function PlansView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [view, setView] = useState<View>("calendar");
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [keywords, setKeywords] = useState<Record<string, string>>({});
  // plan_id → 연결된 콘텐츠 id (있으면 '생성물 보기')
  const [contentByPlan, setContentByPlan] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<ContentPlan | null>(null);

  const [fStatus, setFStatus] = useState("");
  const [fChannel, setFChannel] = useState("");
  const [fAssignee, setFAssignee] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .then(({ data }) => setProfiles((data ?? []) as Profile[]));
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
      .select("id, plan_id")
      .eq("client_id", selectedClientId)
      .not("plan_id", "is", null)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const c of (data ?? []) as { id: string; plan_id: string }[]) {
          // 한 플랜에 여러 콘텐츠면 최신 것 하나(마지막)로
          map[c.plan_id] = c.id;
        }
        setContentByPlan(map);
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
        })),
    [plans],
  );

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
                eventClick={(info) => {
                  const p = plans.find((x) => x.id === info.event.id);
                  if (p) setSelected(p);
                }}
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
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className="cursor-pointer border-t border-border hover:bg-subtle"
                      >
                        <td className="px-3 py-2 font-medium text-ink">
                          {p.title}
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
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted">
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
                  onClick={() => setSelected(null)}
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
              {(() => {
                const genHref = `/generate?planId=${selected.id}&channel=${selected.channel}&title=${encodeURIComponent(selected.title)}`;
                const linkedId = contentByPlan[selected.id];
                if (linkedId) {
                  return (
                    <div className="space-y-2">
                      <Link
                        href={`/library?contentId=${linkedId}`}
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
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
              플랜을 선택하면 상세가 표시됩니다.
            </div>
          )}
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
