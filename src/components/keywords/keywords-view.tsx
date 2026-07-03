"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { getChannel } from "@/lib/channels";
import { addKeywordsToPlan, addTopicToPlan } from "@/lib/actions/keywords";
import type { KeywordIdea } from "@/lib/google-ads";
import type { NaverKeywordIdea } from "@/lib/naver-ads";
import type { ChannelSettings, Keyword } from "@/types/database";

type Tab = "research" | "pool";
type Source = "google" | "naver";

export function KeywordsView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [tab, setTab] = useState<Tab>("research");

  const [source, setSource] = useState<Source>("google");
  const [seeds, setSeeds] = useState("");
  const [ideas, setIdeas] = useState<KeywordIdea[]>([]);
  const [naverRows, setNaverRows] = useState<NaverKeywordIdea[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [channels, setChannels] = useState<ChannelSettings[]>([]);
  const [channel, setChannel] = useState("");
  const [pool, setPool] = useState<Keyword[]>([]);

  // 저장된 풀 → 주제 뽑기 [Feature 4]
  const [poolSel, setPoolSel] = useState<Set<string>>(new Set());
  const [topicChannel, setTopicChannel] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [topicBusy, setTopicBusy] = useState(false);
  const [topicMsg, setTopicMsg] = useState("");
  const [addedTopics, setAddedTopics] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedClientId) return;
    const supabase = createClient();
    supabase
      .from("channel_settings")
      // 필요한 컬럼만 — 비밀 컬럼을 브라우저로 내리지 않는다 [AUDIT H-2]
      .select("id, channel")
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
    setError("");
    setSearched(false);
    setSelected(new Set());
    setIdeas([]);
    setNaverRows([]);
    try {
      const endpoint =
        source === "naver" ? "/api/keywords/naver-ideas" : "/api/keywords/ideas";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seeds: list, clientId: selectedClientId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "조회에 실패했습니다.");
        return;
      }
      if (source === "naver") {
        const rows = data.ideas as NaverKeywordIdea[];
        setNaverRows(rows);
        // 플랜에 추가·선택 재사용을 위해 generic 형태도 보관
        setIdeas(
          rows.map((r) => ({
            keyword: r.keyword,
            avgMonthlySearches: r.monthlyTotal,
            competition: r.competition,
            cpcLow: null,
            cpcHigh: null,
          })),
        );
        setMsg(`${rows.length}개 조회됨`);
      } else {
        setIdeas(data.ideas as KeywordIdea[]);
        setMsg(`${data.ideas.length}개 조회됨`);
      }
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
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
        source: source === "naver" ? "naver_ads" : "google_ads",
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

  // ── 주제 뽑기 [Feature 4] ──
  const tChannel = topicChannel || channels[0]?.channel || "";
  function togglePool(id: string) {
    setPoolSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function genTopics() {
    if (!selectedClientId || !tChannel || poolSel.size === 0) return;
    setTopicBusy(true);
    setTopicMsg("");
    setTopics([]);
    setAddedTopics(new Set());
    try {
      const kws = pool.filter((k) => poolSel.has(k.id)).map((k) => k.keyword);
      const res = await fetch("/api/keywords/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClientId, channel: tChannel, keywords: kws }),
      });
      const d = await res.json();
      if (d.ok) {
        setTopics(d.topics as string[]);
        if (!d.topics.length) setTopicMsg("주제가 생성되지 않았습니다.");
      } else {
        setTopicMsg(`실패: ${d.error}`);
      }
    } catch (e) {
      setTopicMsg(e instanceof Error ? e.message : "주제 생성 실패");
    } finally {
      setTopicBusy(false);
    }
  }
  async function addTopic(title: string) {
    if (!selectedClientId || !tChannel) return;
    const firstKwId = pool.find((k) => poolSel.has(k.id))?.id ?? null;
    const r = await addTopicToPlan({
      clientId: selectedClientId,
      channel: tChannel,
      title,
      keywordId: firstKwId,
    });
    if (r.ok) setAddedTopics((prev) => new Set(prev).add(title));
  }

  if (!selectedClientId) {
    return <p className="text-sm text-muted">상단에서 클라이언트를 선택하세요.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">키워드 리서치</h1>
        <p className="mt-1 text-sm text-muted">
          {selectedClient?.name} · Google Ads · 네이버 검색광고
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
          {/* 소스 선택 [A-1] */}
          <div className="flex gap-2">
            {(["google", "naver"] as Source[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSource(s);
                  setIdeas([]);
                  setNaverRows([]);
                  setSelected(new Set());
                  setSearched(false);
                  setMsg("");
                  setError("");
                }}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm font-medium",
                  source === s
                    ? "border-accent-deep bg-tint text-accent-deep"
                    : "border-border text-ink hover:bg-subtle",
                ].join(" ")}
              >
                {s === "google" ? "Google Ads" : "네이버 검색광고"}
              </button>
            ))}
            {source === "naver" && (
              <span className="self-center text-xs text-muted">
                시드 최대 5개
              </span>
            )}
          </div>

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

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              오류: {error}
            </p>
          )}

          {!error && searched && ideas.length === 0 && (
            <p className="rounded-md bg-subtle px-3 py-2 text-sm text-muted">
              조회 결과가 없습니다. 더 일반적이거나 다른 시드 키워드로 다시
              시도해보세요. (예: &quot;마케팅&quot;, &quot;피부과&quot;)
            </p>
          )}

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

              {source === "naver" ? (
                <NaverTable
                  rows={
                    filter.trim()
                      ? naverRows.filter((r) => r.keyword.includes(filter.trim()))
                      : naverRows
                  }
                  selected={selected}
                  onToggle={toggle}
                />
              ) : (
                <KeywordTable
                  rows={shown}
                  selectable
                  selected={selected}
                  onToggle={toggle}
                />
              )}
            </>
          )}
        </div>
      )}

      {tab === "pool" && (
        <div className="space-y-4">
          {pool.length === 0 ? (
            <p className="text-sm text-muted">저장된 키워드가 없습니다.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={tChannel}
                  onChange={(e) => setTopicChannel(e.target.value)}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
                >
                  {channels.map((c) => (
                    <option key={c.id} value={c.channel}>
                      {getChannel(c.channel)?.label ?? c.channel}
                    </option>
                  ))}
                </select>
                <button
                  onClick={genTopics}
                  disabled={topicBusy || poolSel.size === 0}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
                >
                  {topicBusy ? "생성 중…" : `주제 뽑기 (${poolSel.size})`}
                </button>
                {topicMsg && <span className="text-xs text-muted">{topicMsg}</span>}
              </div>

              {/* 저장된 키워드 (선택) */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-subtle text-left text-xs text-muted">
                    <tr>
                      <th className="w-10 px-3 py-2"></th>
                      <th className="px-3 py-2">키워드</th>
                      <th className="px-3 py-2 text-right">월 검색량</th>
                      <th className="px-3 py-2">경쟁도</th>
                      <th className="px-3 py-2">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pool.map((k) => (
                      <tr key={k.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={poolSel.has(k.id)}
                            onChange={() => togglePool(k.id)}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-ink">{k.keyword}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {k.avg_monthly_searches?.toLocaleString() ?? "-"}
                        </td>
                        <td className="px-3 py-2 text-muted">{k.competition ?? "-"}</td>
                        <td className="px-3 py-2 text-muted">{k.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 주제안 결과 */}
              {topics.length > 0 && (
                <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
                  <h3 className="text-sm font-semibold text-ink">
                    주제안 ({getChannel(tChannel)?.label ?? tChannel})
                  </h3>
                  <ul className="space-y-1.5">
                    {topics.map((t, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-3 rounded-md bg-subtle px-3 py-2"
                      >
                        <span className="text-sm text-ink">{t}</span>
                        <button
                          onClick={() => addTopic(t)}
                          disabled={addedTopics.has(t)}
                          className="shrink-0 rounded-md border border-accent-deep px-2.5 py-1 text-xs font-medium text-accent-deep hover:bg-tint disabled:opacity-50"
                        >
                          {addedTopics.has(t) ? "추가됨" : "플랜에 추가"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NaverTable({
  rows,
  selected,
  onToggle,
}: {
  rows: NaverKeywordIdea[];
  selected: Set<string>;
  onToggle: (kw: string) => void;
}) {
  const sorted = [...rows].sort((a, b) => b.monthlyTotal - a.monthlyTotal);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-subtle text-left text-xs text-muted">
          <tr>
            <th className="w-10 px-3 py-2"></th>
            <th className="px-3 py-2">연관 키워드</th>
            <th className="px-3 py-2 text-right">월간 PC</th>
            <th className="px-3 py-2 text-right">월간 모바일</th>
            <th className="px-3 py-2 text-right">PC CTR</th>
            <th className="px-3 py-2 text-right">모바일 CTR</th>
            <th className="px-3 py-2">경쟁정도</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.keyword} className="border-t border-border">
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(r.keyword)}
                  onChange={() => onToggle(r.keyword)}
                />
              </td>
              <td className="px-3 py-2 font-medium text-ink">{r.keyword}</td>
              <td className="px-3 py-2 text-right font-mono">
                {r.monthlyPc.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {r.monthlyMobile.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-mono text-muted">
                {r.pcCtr.toFixed(2)}%
              </td>
              <td className="px-3 py-2 text-right font-mono text-muted">
                {r.mobileCtr.toFixed(2)}%
              </td>
              <td className="px-3 py-2 text-muted">{r.competition}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
            <th className="px-3 py-2 text-right">CPC 저~고 (계정통화)</th>
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
                  ? `${Math.round(r.cpcLow).toLocaleString()}~${Math.round(r.cpcHigh).toLocaleString()}`
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
