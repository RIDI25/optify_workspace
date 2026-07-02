"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { getChannel } from "@/lib/channels";
import { addKeywordsToPlan } from "@/lib/actions/keywords";
import type { KeywordIdea } from "@/lib/google-ads";
import type { ChannelSettings, Keyword } from "@/types/database";

type Tab = "research" | "pool";

export function KeywordsView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [tab, setTab] = useState<Tab>("research");

  const [seeds, setSeeds] = useState("");
  const [ideas, setIdeas] = useState<KeywordIdea[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [channels, setChannels] = useState<ChannelSettings[]>([]);
  const [channel, setChannel] = useState("");
  const [pool, setPool] = useState<Keyword[]>([]);

  useEffect(() => {
    if (!selectedClientId) return;
    const supabase = createClient();
    supabase
      .from("channel_settings")
      .select("*")
      .eq("client_id", selectedClientId)
      .eq("is_active", true)
      .then(({ data }) => {
        const rows = (data ?? []) as ChannelSettings[];
        setChannels(rows);
        setChannel((prev) => prev || rows[0]?.channel || "");
      });
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientId || tab !== "pool") return;
    const supabase = createClient();
    supabase
      .from("keywords")
      .select("*")
      .eq("client_id", selectedClientId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setPool((data ?? []) as Keyword[]));
  }, [selectedClientId, tab]);

  const shown = useMemo(() => {
    const f = filter.trim();
    const list = f ? ideas.filter((i) => i.keyword.includes(f)) : ideas;
    return [...list].sort(
      (a, b) => (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0),
    );
  }, [ideas, filter]);

  async function search() {
    if (!selectedClientId) return;
    const list = seeds
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    setBusy(true);
    setMsg("");
    setSelected(new Set());
    try {
      const res = await fetch("/api/keywords/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seeds: list, clientId: selectedClientId }),
      });
      const data = await res.json();
      if (data.ok) {
        setIdeas(data.ideas as KeywordIdea[]);
        setMsg(`${data.ideas.length}개 조회됨`);
      } else {
        setMsg(`실패: ${data.error}`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setBusy(false);
    }
  }

  function toggle(kw: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });
  }

  async function addToPlan() {
    if (!selectedClientId || !channel || selected.size === 0) return;
    setBusy(true);
    setMsg("");
    try {
      const chosen = ideas.filter((i) => selected.has(i.keyword));
      const result = await addKeywordsToPlan({
        clientId: selectedClientId,
        channel,
        ideas: chosen,
      });
      setMsg(
        result.ok
          ? `${result.count}개를 플랜에 추가했습니다.`
          : `실패: ${result.error}`,
      );
      if (result.ok) setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  if (!selectedClientId) {
    return <p className="text-sm text-muted">상단에서 클라이언트를 선택하세요.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">키워드 리서치</h1>
        <p className="mt-1 text-sm text-muted">
          {selectedClient?.name} · Google Ads Keyword Planner
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(["research", "pool"] as Tab[]).map((t) => (
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
            {t === "research" ? "리서치" : "저장된 키워드 풀"}
          </button>
        ))}
      </div>

      {tab === "research" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <textarea
              value={seeds}
              onChange={(e) => setSeeds(e.target.value)}
              rows={2}
              placeholder="시드 키워드 (쉼표 또는 줄바꿈으로 구분). 예: 병원 마케팅, 지역 seo"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
            />
            <button
              onClick={search}
              disabled={busy || !seeds.trim()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "조회 중…" : "조회"}
            </button>
            {msg && <span className="ml-3 text-xs text-muted">{msg}</span>}
          </div>

          {ideas.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="필터"
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent-deep"
                />
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
                >
                  {channels.map((c) => (
                    <option key={c.id} value={c.channel}>
                      {getChannel(c.channel)?.label ?? c.channel}
                    </option>
                  ))}
                </select>
                <button
                  onClick={addToPlan}
                  disabled={busy || selected.size === 0}
                  className="rounded-md bg-accent-deep px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  플랜에 추가 ({selected.size})
                </button>
              </div>

              <KeywordTable
                rows={shown}
                selectable
                selected={selected}
                onToggle={toggle}
              />
            </>
          )}
        </div>
      )}

      {tab === "pool" && (
        <div>
          {pool.length === 0 ? (
            <p className="text-sm text-muted">저장된 키워드가 없습니다.</p>
          ) : (
            <KeywordTable
              rows={pool.map((k) => ({
                keyword: k.keyword,
                avgMonthlySearches: k.avg_monthly_searches,
                competition: k.competition,
                cpcLow: k.cpc_low,
                cpcHigh: k.cpc_high,
                status: k.status,
              }))}
            />
          )}
        </div>
      )}
    </div>
  );
}

function KeywordTable({
  rows,
  selectable,
  selected,
  onToggle,
}: {
  rows: (KeywordIdea & { status?: string })[];
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (kw: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-subtle text-left text-xs text-muted">
          <tr>
            {selectable && <th className="w-10 px-3 py-2"></th>}
            <th className="px-3 py-2">키워드</th>
            <th className="px-3 py-2 text-right">월 검색량</th>
            <th className="px-3 py-2">경쟁도</th>
            <th className="px-3 py-2 text-right">CPC (저~고)</th>
            {rows[0]?.status !== undefined && <th className="px-3 py-2">상태</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.keyword} className="border-t border-border">
              {selectable && (
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected?.has(r.keyword) ?? false}
                    onChange={() => onToggle?.(r.keyword)}
                  />
                </td>
              )}
              <td className="px-3 py-2 font-medium text-ink">{r.keyword}</td>
              <td className="px-3 py-2 text-right font-mono">
                {r.avgMonthlySearches?.toLocaleString() ?? "-"}
              </td>
              <td className="px-3 py-2 text-muted">{r.competition ?? "-"}</td>
              <td className="px-3 py-2 text-right font-mono text-muted">
                {r.cpcLow != null && r.cpcHigh != null
                  ? `$${r.cpcLow.toFixed(2)}~$${r.cpcHigh.toFixed(2)}`
                  : "-"}
              </td>
              {r.status !== undefined && (
                <td className="px-3 py-2 text-muted">{r.status}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
