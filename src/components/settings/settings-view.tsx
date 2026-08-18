"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CHANNELS, channelLabel } from "@/lib/channels";
import {
  saveClient,
  savePreset,
  saveChannelAssignee,
  saveWpConnection,
} from "@/lib/actions/settings";
import {
  ensureOnboardingTasks,
  getOnboardingSignals,
  toggleOnboardingTask,
} from "@/lib/actions/onboarding";
import { DEFAULT_ONBOARDING_TASKS, autoDoneKeys } from "@/lib/onboarding";
import { ClientServicesSection } from "@/components/settings/client-services";
import type { Client, ChannelSettings, Profile, Role } from "@/types/database";

interface OnboardingTask {
  id: string;
  task_key: string;
  label: string;
  done: boolean;
}

export function SettingsView({ role }: { role: Role }) {
  const isOwner = role === "owner";
  /** null = 고객사 목록, 값 = 해당 고객사 상세 설정 */
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [usage, setUsage] = useState<
    { provider: string; count: number; cost: number }[]
  >([]);

  const reload = () => {
    const supabase = createClient();
    supabase
      .from("clients")
      .select("*")
      .order("is_internal", { ascending: false })
      .then(({ data }) => setClients((data ?? []) as Client[]));
  };

  useEffect(() => {
    const supabase = createClient();
    reload();
    supabase
      .from("profiles")
      .select("*")
      .then(({ data }) => setProfiles((data ?? []) as Profile[]));
    const d = new Date();
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    supabase
      .from("api_usage_logs")
      .select("provider, estimated_cost_usd")
      .gte("created_at", monthStart)
      .then(({ data }) => {
        const map: Record<string, { count: number; cost: number }> = {};
        for (const r of (data ?? []) as {
          provider: string;
          estimated_cost_usd: number | null;
        }[]) {
          const m = (map[r.provider] ??= { count: 0, cost: 0 });
          m.count++;
          m.cost += Number(r.estimated_cost_usd) || 0;
        }
        setUsage(
          Object.entries(map).map(([provider, v]) => ({ provider, ...v })),
        );
      });
  }, []);

  const activeClient = clients.find((c) => c.id === activeId) ?? null;

  // ── 상세: 선택한 고객사의 기본정보·프리셋·워드프레스 ──────
  if (activeClient) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveId(null)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-subtle"
          >
            ← 고객사 목록
          </button>
          <h1 className="text-xl font-bold text-ink">
            {activeClient.name}
            {activeClient.is_internal && (
              <span className="ml-2 rounded bg-tint px-1.5 py-0.5 text-xs font-medium text-accent-deep">
                내부
              </span>
            )}
          </h1>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-ink">계약 서비스</h2>
          <ClientServicesSection
            key={activeClient.id}
            clientId={activeClient.id}
            readOnly={!isOwner}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-ink">기본 정보 · 온보딩</h2>
          <ClientCard client={activeClient} readOnly={!isOwner} onSaved={reload} />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-ink">채널 프리셋</h2>
          <PresetsTab
            key={activeClient.id}
            clients={[activeClient]}
            profiles={profiles}
            readOnly={!isOwner}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-ink">워드프레스 연결</h2>
          <WordpressTab key={activeClient.id} clients={[activeClient]} readOnly={!isOwner} />
        </section>
      </div>
    );
  }

  // ── 목록: 고객사 선택 + 팀원·API 사용량 ───────────────────
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">설정</h1>
        {!isOwner && (
          <p className="mt-1 rounded-md bg-tint px-3 py-1.5 text-sm text-accent-deep">
            멤버 권한은 조회만 가능합니다. 편집은 관리자(owner) 전용입니다.
          </p>
        )}
      </div>

      {/* 고객사 목록 — 옵티파이(내부)가 최상단 */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink">고객사 목록</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className="flex w-full items-center justify-between border-b border-border bg-surface px-4 py-3 text-left last:border-b-0 hover:bg-tint/40"
            >
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{c.name}</span>
                {c.is_internal && (
                  <span className="rounded bg-tint px-1.5 py-0.5 text-[11px] font-medium text-accent-deep">
                    내부
                  </span>
                )}
                <span
                  className={[
                    "rounded px-1.5 py-0.5 text-[11px]",
                    c.status === "active"
                      ? "bg-subtle text-muted"
                      : "bg-amber-50 text-amber-700",
                  ].join(" ")}
                >
                  {c.status === "active" ? "운영중" : c.status === "paused" ? "일시중지" : "종료"}
                </span>
              </span>
              <span className="text-muted">→</span>
            </button>
          ))}
          {clients.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">고객사가 없습니다.</p>
          )}
        </div>
        {isOwner && (
          <div className="flex gap-2 rounded-lg border border-dashed border-border p-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="새 고객사 이름"
              className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
            />
            <button
              onClick={async () => {
                if (!newName.trim()) return;
                const r = await saveClient(null, { name: newName.trim() });
                if (r.ok) {
                  setNewName("");
                  reload();
                }
              }}
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-ink hover:opacity-90"
            >
              추가
            </button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink">팀원</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">역할</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2 text-ink">{p.name}</td>
                  <td className="px-3 py-2 text-muted">
                    {p.role === "owner" ? "관리자" : "멤버"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink">API 사용량 (이번 달)</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">제공자</th>
                <th className="px-3 py-2 text-right">호출 수</th>
                <th className="px-3 py-2 text-right">추정 비용(USD)</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.provider} className="border-t border-border">
                  <td className="px-3 py-2 text-ink">{u.provider}</td>
                  <td className="px-3 py-2 text-right font-mono">{u.count}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    ${u.cost.toFixed(2)}
                  </td>
                </tr>
              ))}
              {usage.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-muted">
                    이번 달 사용 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ClientCard({
  client,
  readOnly,
  onSaved,
}: {
  client: Client;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const [name, setName] = useState(client.name);
  const [gsc, setGsc] = useState(client.gsc_site_url ?? "");
  const [ga4, setGa4] = useState(client.ga4_property_id ?? "");
  const [status, setStatus] = useState(client.status);
  const [memo, setMemo] = useState(client.memo ?? "");
  const [msg, setMsg] = useState("");

  async function save() {
    const r = await saveClient(client.id, {
      name,
      gsc_site_url: gsc || null,
      ga4_property_id: ga4 || null,
      status,
      memo: memo || null,
    });
    setMsg(r.ok ? "저장됨" : `실패: ${r.error}`);
    setTimeout(() => setMsg(""), 2000);
    if (r.ok) onSaved();
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none focus:border-accent-deep disabled:bg-subtle"
        />
        {client.is_internal && (
          <span className="rounded bg-tint px-2 py-0.5 text-xs text-accent-deep">
            내부
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="GSC 사이트 URL (sc-domain:… 또는 https://…)" value={gsc} onChange={setGsc} disabled={readOnly} />
        <Field label="GA4 속성 ID (숫자)" value={ga4} onChange={setGa4} disabled={readOnly} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted">상태</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Client["status"])}
            disabled={readOnly}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm disabled:bg-subtle"
          >
            <option value="active">진행</option>
            <option value="paused">중지</option>
            <option value="ended">종료</option>
          </select>
        </div>
        <Field label="메모" value={memo} onChange={setMemo} disabled={readOnly} />
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:opacity-90"
          >
            저장
          </button>
          {msg && <span className="text-xs text-muted">{msg}</span>}
        </div>
      )}

      {!client.is_internal && (
        <OnboardingChecklist clientId={client.id} readOnly={readOnly} />
      )}
    </div>
  );
}

function OnboardingChecklist({
  clientId,
  readOnly,
}: {
  clientId: string;
  readOnly: boolean;
}) {
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [autoDone, setAutoDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    async function load() {
      if (!readOnly) await ensureOnboardingTasks(clientId);
      const supabase = createClient();
      const [{ data: rows }, signals] = await Promise.all([
        supabase
          .from("client_onboarding_tasks")
          .select("id, task_key, label, done")
          .eq("client_id", clientId),
        getOnboardingSignals(clientId),
      ]);
      if (!active) return;
      setTasks((rows ?? []) as OnboardingTask[]);
      setAutoDone(autoDoneKeys(signals));
    }
    void load();
    return () => {
      active = false;
    };
  }, [clientId, readOnly]);

  async function toggle(t: OnboardingTask) {
    const next = !t.done;
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, done: next } : x)),
    );
    await toggleOnboardingTask(t.id, next);
  }

  const ordered = DEFAULT_ONBOARDING_TASKS.map((d) =>
    tasks.find((t) => t.task_key === d.key),
  ).filter((t): t is OnboardingTask => !!t);
  const remaining = ordered.filter(
    (t) => !t.done && !autoDone.has(t.task_key),
  ).length;

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink">온보딩 체크리스트</h4>
        <span className="text-xs text-muted">미완료 {remaining}건</span>
      </div>
      <ul className="space-y-1.5">
        {ordered.map((t) => {
          const auto = autoDone.has(t.task_key);
          const done = t.done || auto;
          return (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={done}
                disabled={readOnly || auto}
                onChange={() => toggle(t)}
              />
              <span className={done ? "text-muted line-through" : "text-ink"}>
                {t.label}
              </span>
              {auto && <span className="text-xs text-accent-deep">(자동)</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PresetsTab({
  clients,
  profiles,
  readOnly,
}: {
  clients: Client[];
  profiles: Profile[];
  readOnly: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [settings, setSettings] = useState<ChannelSettings[]>([]);
  const [channel, setChannel] = useState("");
  const [json, setJson] = useState("");
  const [msg, setMsg] = useState("");
  const [assigneeMsg, setAssigneeMsg] = useState("");
  // AI 프리셋 초안 [A-3]
  const [draftOpen, setDraftOpen] = useState(false);
  const [refBlog, setRefBlog] = useState("");
  const [refHome, setRefHome] = useState("");
  const [refTarget, setRefTarget] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftMsg, setDraftMsg] = useState("");
  const cid = clientId || clients[0]?.id || "";

  async function loadSettings(keepChannel?: string) {
    const { data } = await createClient()
      .from("channel_settings")
      .select("id, channel, preset, default_assignee")
      .eq("client_id", cid);
    const rows = (data ?? []) as ChannelSettings[];
    setSettings(rows);
    // 등록된 첫 채널 → 없으면 레지스트리 첫 채널 (미등록이어도 선택·저장 가능해야 한다)
    const ch = keepChannel ?? rows[0]?.channel ?? CHANNELS[0]?.key ?? "";
    setChannel(ch);
    const s = rows.find((x) => x.channel === ch);
    setJson(s ? JSON.stringify(s.preset, null, 2) : "{}");
    return rows;
  }

  useEffect(() => {
    if (!cid) return;
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  // 레지스트리 전체 + (레지스트리에 없지만 DB에 있는) 채널의 합집합
  const channelOptions = [
    ...CHANNELS.map((c) => c.key),
    ...settings.map((s) => s.channel).filter((ch) => !CHANNELS.some((c) => c.key === ch)),
  ];
  const isRegistered = (ch: string) => settings.some((s) => s.channel === ch);

  function selectChannel(ch: string) {
    setChannel(ch);
    const s = settings.find((x) => x.channel === ch);
    setJson(s ? JSON.stringify(s.preset, null, 2) : "{}");
  }

  const currentAssignee =
    settings.find((s) => s.channel === channel)?.default_assignee ?? "";

  async function changeAssignee(value: string) {
    const assignee = value || null;
    const wasNew = !isRegistered(channel);
    setSettings((prev) =>
      prev.map((s) =>
        s.channel === channel ? { ...s, default_assignee: assignee } : s,
      ),
    );
    const r = await saveChannelAssignee(cid, channel, assignee);
    if (r.ok && wasNew) await loadSettings(channel); // upsert로 행이 생성됨
    setAssigneeMsg(r.ok ? "기본 담당자 저장됨" : `실패: ${r.error}`);
    setTimeout(() => setAssigneeMsg(""), 2000);
  }

  async function save() {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch {
      setMsg("JSON 형식 오류");
      return;
    }
    const wasNew = !isRegistered(channel);
    const r = await savePreset(cid, channel, parsed);
    if (r.ok) {
      // 신규 채널이면 행이 생성됐으니 목록 갱신 (담당자 지정도 바로 가능해진다)
      await loadSettings(channel);
      setMsg(wasNew ? "채널 등록 + 프리셋 저장됨" : "저장됨");
    } else {
      setMsg(`실패: ${r.error}`);
    }
    setTimeout(() => setMsg(""), 2500);
  }

  async function genDraft() {
    if (!channel) return;
    setDraftBusy(true);
    setDraftMsg("");
    try {
      const res = await fetch("/api/settings/preset-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: cid,
          channel,
          references: { blog: refBlog, homepage: refHome, target: refTarget },
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setJson(JSON.stringify(d.preset, null, 2));
        setDraftOpen(false);
        setMsg("초안 생성됨 — 검토 후 '프리셋 저장'을 누르세요.");
        setTimeout(() => setMsg(""), 3000);
      } else {
        setDraftMsg(`실패: ${d.error}`);
      }
    } catch (e) {
      setDraftMsg(e instanceof Error ? e.message : "초안 생성 실패");
    } finally {
      setDraftBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={cid}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={channel}
          onChange={(e) => selectChannel(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
        >
          {channelOptions.map((ch) => (
            <option key={ch} value={ch}>
              {channelLabel(ch)}
              {isRegistered(ch) ? "" : " (미등록)"}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          기본 담당자
          <select
            value={currentAssignee}
            onChange={(e) => changeAssignee(e.target.value)}
            disabled={readOnly || !channel}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink disabled:bg-subtle"
          >
            <option value="">없음</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.role === "owner" ? "관리자" : "멤버"})
              </option>
            ))}
          </select>
        </label>
        {assigneeMsg && (
          <span className="self-center text-xs text-muted">{assigneeMsg}</span>
        )}
      </div>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        disabled={readOnly}
        rows={20}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent-deep disabled:bg-subtle"
      />
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={save}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:opacity-90"
          >
            프리셋 저장
          </button>
          <button
            onClick={() => setDraftOpen(true)}
            disabled={!channel}
            className="rounded-md border border-accent-deep px-3 py-1.5 text-sm font-medium text-accent-deep hover:bg-tint disabled:opacity-50"
          >
            AI로 프리셋 초안 생성
          </button>
          {msg && <span className="text-xs text-muted">{msg}</span>}
        </div>
      )}

      {/* AI 프리셋 초안 모달 [A-3] */}
      {draftOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-surface p-5 shadow-lg">
            <h3 className="text-base font-bold text-ink">
              AI 프리셋 초안 생성 ({channelLabel(channel)})
            </h3>
            <p className="text-xs text-muted">
              참고 자료를 넣을수록 정확해집니다. 생성 후 편집기에서 검토·수정하고
              저장하세요.
            </p>
            <TextArea label="홈페이지 소개 텍스트" value={refHome} onChange={setRefHome} />
            <TextArea label="타겟 독자 설명" value={refTarget} onChange={setRefTarget} />
            <TextArea label="기존 블로그 글 예시(붙여넣기)" value={refBlog} onChange={setRefBlog} />
            {draftMsg && <p className="text-xs text-red-600">{draftMsg}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDraftOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-subtle"
              >
                취소
              </button>
              <button
                onClick={genDraft}
                disabled={draftBusy}
                className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
              >
                {draftBusy ? "생성 중…" : "초안 생성"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
      />
    </div>
  );
}

function WordpressTab({ clients, readOnly }: { clients: Client[]; readOnly: boolean }) {
  const [clientId, setClientId] = useState("");
  const [wpUrl, setWpUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpPassword, setWpPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const cid = clientId || clients[0]?.id || "";

  useEffect(() => {
    if (!cid) return;
    createClient()
      .from("channel_settings")
      .select("wp_url, wp_username")
      .eq("client_id", cid)
      .eq("channel", "wordpress")
      .maybeSingle()
      .then(({ data }) => {
        setWpUrl(data?.wp_url ?? "");
        setWpUsername(data?.wp_username ?? "");
        setWpPassword("");
      });
  }, [cid]);

  async function test() {
    setTestMsg("테스트 중…");
    const res = await fetch("/api/wordpress/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        wpPassword
          ? { wpUrl, wpUsername, wpPassword }
          : { clientId: cid },
      ),
    });
    const d = await res.json();
    setTestMsg(d.ok ? `연결 성공 (${d.name ?? "OK"})` : `실패: ${d.error}`);
  }

  async function save() {
    const r = await saveWpConnection(cid, {
      wpUrl,
      wpUsername,
      wpPassword: wpPassword || undefined,
    });
    setMsg(r.ok ? "저장됨" : `실패: ${r.error}`);
    setTimeout(() => setMsg(""), 2000);
  }

  return (
    <div className="max-w-lg space-y-3">
      <select
        value={cid}
        onChange={(e) => setClientId(e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Field label="사이트 URL (https://example.com)" value={wpUrl} onChange={setWpUrl} disabled={readOnly} />
      <Field label="사용자명" value={wpUsername} onChange={setWpUsername} disabled={readOnly} />
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted">
          Application Password (변경 시에만 입력, 비우면 유지)
        </label>
        <input
          type="password"
          value={wpPassword}
          onChange={(e) => setWpPassword(e.target.value)}
          disabled={readOnly}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep disabled:bg-subtle"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={test}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-subtle"
        >
          연결 테스트
        </button>
        {!readOnly && (
          <button
            onClick={save}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:opacity-90"
          >
            저장
          </button>
        )}
        {testMsg && <span className="text-xs text-muted">{testMsg}</span>}
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep disabled:bg-subtle"
      />
    </div>
  );
}
