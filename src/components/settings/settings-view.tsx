"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CHANNELS, channelLabel } from "@/lib/channels";
import {
  saveClient,
  savePreset,
  saveChannelAssignee,
  saveChannelConnection,
  revealChannelPassword,
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

/** 말투 템플릿 — 폼에서 선택하면 tone_rules로 저장된다 */
const TONE_PRESETS: { key: string; label: string; rules: string[] }[] = [
  {
    key: "consult",
    label: "전문가 상담형 — '~합니다' 기본 + '~해요' 혼합",
    rules: [
      "'~합니다/~입니다' 체를 기본으로 '~해요/~인데요'를 섞어 옆에서 상담하듯 편하게",
      "과장 없이 근거 중심으로, 신뢰감은 유지하되 경직되지 않게",
    ],
  },
  {
    key: "friendly",
    label: "친근한 이웃형 — '~해요' 위주",
    rules: [
      "'~해요/~인데요' 체 위주로 이웃에게 이야기하듯 편하게",
      "쉬운 단어로 짧게 끊어 쓰고, 독자가 겪는 장면에서 출발",
    ],
  },
  {
    key: "formal",
    label: "격식 정보형 — '~입니다' 위주",
    rules: [
      "'~입니다/~합니다' 체로 정확하고 담백하게",
      "감탄사·이모지 없이 정보 중심으로",
    ],
  },
];

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
  // 폼 편집 상태 (JSON은 고급용으로만 유지)
  const [persona, setPersona] = useState("");
  const [targetReader, setTargetReader] = useState("");
  const [toneKey, setToneKey] = useState("consult");
  const [extraRules, setExtraRules] = useState("");
  const [hasExistingTone, setHasExistingTone] = useState(false);
  /** 폼 저장의 기준이 되는 전체 프리셋 (AI 초안 포함) — 폼에 없는 키를 보존한다 */
  const [baseline, setBaseline] = useState<Record<string, unknown>>({});
  const [assigneeMsg, setAssigneeMsg] = useState("");
  // AI 프리셋 초안 [A-3]
  const [draftOpen, setDraftOpen] = useState(false);
  const [refBlog, setRefBlog] = useState("");
  const [refHome, setRefHome] = useState("");
  const [refTarget, setRefTarget] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftMsg, setDraftMsg] = useState("");
  const cid = clientId || clients[0]?.id || "";

  /** 프리셋 객체 → 폼 필드 + JSON 편집기 동기화 */
  function applyPreset(preset: Record<string, unknown>) {
    setBaseline(preset);
    setJson(JSON.stringify(preset, null, 2));
    setPersona(typeof preset.persona === "string" ? preset.persona : "");
    setTargetReader(
      typeof preset.target_reader === "string" ? preset.target_reader : "",
    );
    const existingTone = Array.isArray(preset.tone_rules) && preset.tone_rules.length > 0;
    setHasExistingTone(existingTone);
    setToneKey(existingTone ? "keep" : "consult");
    setExtraRules(
      Array.isArray(preset.extra_rules) ? preset.extra_rules.join("\n") : "",
    );
  }

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
    applyPreset(s?.preset ?? {});
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
    applyPreset(s?.preset ?? {});
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

  async function persist(preset: Record<string, unknown>) {
    const wasNew = !isRegistered(channel);
    const r = await savePreset(cid, channel, preset);
    if (r.ok) {
      // 신규 채널이면 행이 생성됐으니 목록 갱신 (담당자 지정도 바로 가능해진다)
      await loadSettings(channel);
      setMsg(wasNew ? "채널 등록 + 프리셋 저장됨" : "저장됨");
    } else {
      setMsg(`실패: ${r.error}`);
    }
    setTimeout(() => setMsg(""), 2500);
  }

  /** 폼 값으로 프리셋 조립 — 기준 프리셋(AI 초안 포함)의 다른 키는 그대로 보존 */
  async function saveForm() {
    const base: Record<string, unknown> = { ...baseline };
    if (persona.trim()) base.persona = persona.trim();
    else delete base.persona;
    if (targetReader.trim()) base.target_reader = targetReader.trim();
    else delete base.target_reader;
    const tone = TONE_PRESETS.find((t) => t.key === toneKey);
    if (tone) base.tone_rules = tone.rules; // 'keep'이면 기존 tone_rules 유지
    const extras = extraRules
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (extras.length) base.extra_rules = extras;
    else delete base.extra_rules;
    await persist(base);
  }

  /** 고급 — JSON 직접 저장 */
  async function saveJson() {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch {
      setMsg("JSON 형식 오류 — 폼으로 저장하면 형식 걱정 없이 저장됩니다.");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    await persist(parsed);
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
        applyPreset(d.preset);
        setDraftOpen(false);
        setMsg("초안 생성됨 — 폼에서 검토 후 '프리셋 저장'을 누르세요.");
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
      {/* 프리셋 폼 — JSON 없이 고르고 입력해서 저장 */}
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">
          글 스타일 프리셋 — {channelLabel(channel)}
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">
              페르소나 (누가 쓰는 글인가)
            </span>
            <input
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              disabled={readOnly}
              placeholder="예: 15년차 인테리어 전문가가 상담하듯 알려주는 글"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep disabled:bg-subtle"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">
              대상 독자 (누가 읽는 글인가)
            </span>
            <input
              value={targetReader}
              onChange={(e) => setTargetReader(e.target.value)}
              disabled={readOnly}
              placeholder="예: 사무실 이전·인테리어를 알아보는 중소기업 대표"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep disabled:bg-subtle"
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">말투</span>
          <select
            value={toneKey}
            onChange={(e) => setToneKey(e.target.value)}
            disabled={readOnly}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm disabled:bg-subtle md:w-auto"
          >
            {hasExistingTone && (
              <option value="keep">기존 말투 규칙 유지</option>
            )}
            {TONE_PRESETS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">
            추가 규칙 (선택 — 한 줄에 하나씩)
          </span>
          <textarea
            value={extraRules}
            onChange={(e) => setExtraRules(e.target.value)}
            disabled={readOnly}
            rows={3}
            placeholder={"예:\n가격은 구체 금액 대신 범위로만 언급\n마무리에 상담 유도 문구 넣지 않기"}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep disabled:bg-subtle"
          />
        </label>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={saveForm}
              className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-ink hover:opacity-90"
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
      </div>

      {/* 채널 계정/연결 정보 — 워드프레스는 전용 탭 사용 */}
      {channel !== "wordpress" && (
        <ChannelConnection cid={cid} channel={channel} readOnly={readOnly} />
      )}

      {/* 고급 — JSON 직접 편집 */}
      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-muted">
          고급 — 프리셋 JSON 직접 편집
        </summary>
        <div className="mt-3 space-y-2">
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            disabled={readOnly}
            rows={16}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent-deep disabled:bg-subtle"
          />
          {!readOnly && (
            <button
              onClick={saveJson}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-ink hover:bg-subtle"
            >
              JSON으로 저장
            </button>
          )}
        </div>
      </details>

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

/** 채널 계정/연결 정보 — 아이디·비밀번호(암호화)·주소·카테고리.
 * 네이버 블로그처럼 수동 발행하는 채널의 로그인 정보를 팀이 공유한다. */
function ChannelConnection({
  cid,
  channel,
  readOnly,
}: {
  cid: string;
  channel: string;
  readOnly: boolean;
}) {
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [shownPassword, setShownPassword] = useState<string | null>(null);
  const [channelUrl, setChannelUrl] = useState("");
  // 카테고리(게시판)는 여러 개 — 태그로 관리, DB에는 쉼표 구분 문자열로 저장
  const [categories, setCategories] = useState<string[]>([]);
  const [catInput, setCatInput] = useState("");
  const [msg, setMsg] = useState("");
  const [needsMigration, setNeedsMigration] = useState(false);

  const isNaver = channel.startsWith("naver");
  const idLabel = isNaver ? "네이버 아이디" : "계정 아이디";
  const urlLabel =
    channel === "naver_blog"
      ? "블로그 주소"
      : channel === "naver_place"
        ? "플레이스 주소"
        : "채널 주소";

  useEffect(() => {
    if (!cid || !channel) return;
    setMsg("");
    setShownPassword(null);
    setPassword("");
    createClient()
      .from("channel_settings")
      .select("account_id, channel_url, category, account_password_encrypted")
      .eq("client_id", cid)
      .eq("channel", channel)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          // 0020 마이그레이션 전이면 컬럼이 없어 조회 실패 — 안내만 하고 프리셋 편집은 유지
          setNeedsMigration(true);
          return;
        }
        setNeedsMigration(false);
        setAccountId(data?.account_id ?? "");
        setChannelUrl(data?.channel_url ?? "");
        setCategories(
          (data?.category ?? "")
            .split(/[,\n]/)
            .map((s: string) => s.trim())
            .filter(Boolean),
        );
        setCatInput("");
        setHasPassword(!!data?.account_password_encrypted);
      });
  }, [cid, channel]);

  function addCategory() {
    const v = catInput.trim();
    if (!v) return;
    setCategories((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setCatInput("");
  }

  async function save() {
    // 입력창에 치고 [추가]를 안 누른 값도 저장에 포함
    const pending = catInput.trim();
    const finalCategories =
      pending && !categories.includes(pending)
        ? [...categories, pending]
        : categories;
    if (pending) {
      setCategories(finalCategories);
      setCatInput("");
    }
    const r = await saveChannelConnection(cid, channel, {
      accountId,
      password: password || undefined,
      channelUrl,
      category: finalCategories.join(", "),
    });
    if (r.ok) {
      if (password) setHasPassword(true);
      setPassword("");
      setMsg("계정 정보 저장됨");
    } else {
      setMsg(`실패: ${r.error}`);
    }
    setTimeout(() => setMsg(""), 3500);
  }

  async function reveal() {
    if (shownPassword !== null) {
      setShownPassword(null);
      return;
    }
    const r = await revealChannelPassword(cid, channel);
    if (r.ok && r.password) setShownPassword(r.password);
    else {
      setMsg(r.error ?? "조회 실패");
      setTimeout(() => setMsg(""), 2500);
    }
  }

  if (needsMigration) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        채널 계정 정보를 쓰려면 <b>supabase/migrations/0020_channel_connection.sql</b>을
        Supabase SQL Editor에서 한 번 실행해 주세요.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">
        채널 계정 정보 — {channelLabel(channel)}
      </h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">{idLabel}</span>
          <input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={readOnly}
            placeholder="예: optify_partner"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep disabled:bg-subtle"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">
            비밀번호 {hasPassword && "(저장됨 — 변경 시에만 입력)"}
          </span>
          <div className="flex gap-1.5">
            <input
              type={shownPassword !== null ? "text" : "password"}
              value={shownPassword ?? password}
              onChange={(e) => {
                setShownPassword(null);
                setPassword(e.target.value);
              }}
              disabled={readOnly && shownPassword === null}
              placeholder={hasPassword ? "••••••••" : "비밀번호 입력"}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep disabled:bg-subtle"
            />
            {hasPassword && (
              <button
                onClick={reveal}
                type="button"
                className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:bg-subtle"
              >
                {shownPassword !== null ? "숨기기" : "보기"}
              </button>
            )}
          </div>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">{urlLabel}</span>
          <input
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            disabled={readOnly}
            placeholder="https://blog.naver.com/…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep disabled:bg-subtle"
          />
        </label>
        <div className="space-y-1">
          <span className="block text-xs font-medium text-muted">
            카테고리 (글 올릴 게시판 — 여러 개 등록 가능)
          </span>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-1">
              {categories.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full bg-tint px-2.5 py-1 text-xs font-medium text-accent-deep"
                >
                  {c}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() =>
                        setCategories((prev) => prev.filter((x) => x !== c))
                      }
                      className="text-accent-deep/60 hover:text-accent-deep"
                      aria-label={`${c} 삭제`}
                    >
                      ✕
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {!readOnly && (
            <div className="flex gap-1.5">
              <input
                value={catInput}
                onChange={(e) => setCatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder="예: 인테리어 정보 — 입력 후 Enter 또는 [추가]"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
              />
              <button
                type="button"
                onClick={addCategory}
                className="shrink-0 rounded-md border border-border px-3 py-1 text-sm text-muted hover:bg-subtle"
              >
                추가
              </button>
            </div>
          )}
        </div>
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            className="rounded-md bg-accent-deep px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            계정 정보 저장
          </button>
          {msg && <span className="text-xs text-muted">{msg}</span>}
        </div>
      )}
      <p className="text-[11px] text-muted">
        비밀번호는 암호화되어 저장되고, [보기]를 눌렀을 때만 서버에서 복호화해
        보여줍니다.
      </p>
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
