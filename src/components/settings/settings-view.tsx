"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { channelLabel } from "@/lib/channels";
import {
  saveClient,
  savePreset,
  saveChannelAssignee,
  saveWpConnection,
} from "@/lib/actions/settings";
import type { Client, ChannelSettings, Profile, Role } from "@/types/database";

type Tab = "clients" | "presets" | "wordpress" | "team" | "usage";

export function SettingsView({ role }: { role: Role }) {
  const isOwner = role === "owner";
  const [tab, setTab] = useState<Tab>("clients");
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

      <div className="flex flex-wrap gap-2 border-b border-border">
        {(
          [
            ["clients", "클라이언트"],
            ["presets", "채널 프리셋"],
            ["wordpress", "워드프레스"],
            ["team", "팀원"],
            ["usage", "API 사용량"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-3 py-2 text-sm font-medium",
              tab === t
                ? "border-b-2 border-accent-deep text-accent-deep"
                : "text-muted",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "clients" && (
        <ClientsTab clients={clients} readOnly={!isOwner} onSaved={reload} />
      )}
      {tab === "presets" && (
        <PresetsTab clients={clients} profiles={profiles} readOnly={!isOwner} />
      )}
      {tab === "wordpress" && (
        <WordpressTab clients={clients} readOnly={!isOwner} />
      )}
      {tab === "team" && (
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
      )}
      {tab === "usage" && (
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
      )}
    </div>
  );
}

function ClientsTab({
  clients,
  readOnly,
  onSaved,
}: {
  clients: Client[];
  readOnly: boolean;
  onSaved: () => void;
}) {
  const [newName, setNewName] = useState("");
  return (
    <div className="space-y-4">
      {clients.map((c) => (
        <ClientCard key={c.id} client={c} readOnly={readOnly} onSaved={onSaved} />
      ))}
      {!readOnly && (
        <div className="flex gap-2 rounded-lg border border-dashed border-border p-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="새 클라이언트 이름"
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
          />
          <button
            onClick={async () => {
              if (!newName.trim()) return;
              const r = await saveClient(null, { name: newName.trim() });
              if (r.ok) {
                setNewName("");
                onSaved();
              }
            }}
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-ink hover:opacity-90"
          >
            추가
          </button>
        </div>
      )}
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
  const cid = clientId || clients[0]?.id || "";

  useEffect(() => {
    if (!cid) return;
    createClient()
      .from("channel_settings")
      .select("id, channel, preset, default_assignee")
      .eq("client_id", cid)
      .then(({ data }) => {
        const rows = (data ?? []) as ChannelSettings[];
        setSettings(rows);
        const first = rows[0];
        setChannel(first?.channel ?? "");
        setJson(first ? JSON.stringify(first.preset, null, 2) : "");
      });
  }, [cid]);

  function selectChannel(ch: string) {
    setChannel(ch);
    const s = settings.find((x) => x.channel === ch);
    setJson(s ? JSON.stringify(s.preset, null, 2) : "{}");
  }

  const currentAssignee =
    settings.find((s) => s.channel === channel)?.default_assignee ?? "";

  async function changeAssignee(value: string) {
    const assignee = value || null;
    setSettings((prev) =>
      prev.map((s) =>
        s.channel === channel ? { ...s, default_assignee: assignee } : s,
      ),
    );
    const r = await saveChannelAssignee(cid, channel, assignee);
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
    const r = await savePreset(cid, channel, parsed);
    setMsg(r.ok ? "저장됨" : `실패: ${r.error}`);
    setTimeout(() => setMsg(""), 2000);
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
          {settings.map((s) => (
            <option key={s.id} value={s.channel}>
              {channelLabel(s.channel)}
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
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:opacity-90"
          >
            프리셋 저장
          </button>
          {msg && <span className="text-xs text-muted">{msg}</span>}
        </div>
      )}
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
