"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { getChannel } from "@/lib/channels";
import { addTopicToPlan } from "@/lib/actions/keywords";
import { KeywordReportView } from "@/components/keywords/keyword-report";
import type { ChannelSettings, Keyword } from "@/types/database";

type Tab = "report" | "pool";

const SOURCE_LABELS: Record<string, string> = {
  naver_ads: "네이버",
  google_ads: "구글",
  gsc: "GSC",
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  candidate: { label: "후보", cls: "bg-subtle text-muted" },
  planned: { label: "플랜 반영", cls: "bg-tint text-accent-deep" },
  discarded: { label: "보류", cls: "bg-red-50 text-red-500" },
};

export function KeywordsView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [tab, setTab] = useState<Tab>("report");

  const [channels, setChannels] = useState<ChannelSettings[]>([]);
  const [pool, setPool] = useState<Keyword[]>([]);

  // 보관함 → 주제 뽑기 [Feature 4]
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
        setTopicChannel((prev) => prev || rows[0]?.channel || "");
      });
  }, [selectedClientId]);

  const loadPool = useCallback(() => {
    if (!selectedClientId) return;
    const supabase = createClient();
    supabase
      .from("keywords")
      .select("*")
      .eq("client_id", selectedClientId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setPool((data ?? []) as Keyword[]));
  }, [selectedClientId]);

  useEffect(() => {
    if (tab === "pool") loadPool();
  }, [tab, loadPool]);

  const tChannel = topicChannel || channels[0]?.channel || "";
  const firstSelectedKeyword =
    pool.find((k) => poolSel.has(k.id))?.keyword ?? "";

  function togglePool(id: string) {
    setPoolSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function removeKeyword(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("keywords").delete().eq("id", id);
    if (!error) {
      setPool((prev) => prev.filter((k) => k.id !== id));
      setPoolSel((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
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
        body: JSON.stringify({
          clientId: selectedClientId,
          channel: tChannel,
          keywords: kws,
        }),
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
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">키워드 리서치</h1>
        <p className="mt-1 text-sm text-muted">
          {selectedClient?.name} · 리포트로 발굴 → ☆ 보관함 저장 → 주제 뽑기 →
          플랜·생성
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(["report", "pool"] as Tab[]).map((t) => (
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
            {t === "report" ? "📊 키워드 리포트" : "⭐ 키워드 보관함"}
          </button>
        ))}
      </div>

      {tab === "report" && <KeywordReportView />}

      {tab === "pool" && (
        <div className="space-y-4">
          {/* 흐름 안내 */}
          <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-ink">
            💡 리포트에서 ☆로 저장한 키워드가 여기 모여요. 키워드를 선택해{" "}
            <b>주제 뽑기</b>를 누르면 AI가 콘텐츠 주제를 제안하고, 주제별로{" "}
            <b>플랜에 추가</b>하거나 바로 <b>콘텐츠 생성</b>으로 넘어갈 수
            있어요.
          </div>

          {pool.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-8 text-center">
              <p className="text-sm text-muted">아직 보관한 키워드가 없습니다.</p>
              <button
                onClick={() => setTab("report")}
                className="mt-3 rounded-md bg-accent-deep px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                키워드 리포트에서 발굴하기
              </button>
            </div>
          ) : (
            <>
              {/* 주제 뽑기 툴바 */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3">
                <span className="text-sm text-muted">
                  선택 {poolSel.size}개 →
                </span>
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
                  {topicBusy ? "생성 중…" : "💡 주제 뽑기"}
                </button>
                {topicMsg && <span className="text-xs text-muted">{topicMsg}</span>}
              </div>

              {/* 주제안 결과 */}
              {topics.length > 0 && (
                <div className="space-y-2 rounded-xl border border-accent-deep/30 bg-tint/40 p-4">
                  <h3 className="text-sm font-semibold text-ink">
                    💡 주제안 ({getChannel(tChannel)?.label ?? tChannel})
                  </h3>
                  <ul className="space-y-1.5">
                    {topics.map((t, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-3 py-2"
                      >
                        <span className="text-sm text-ink">{t}</span>
                        <span className="flex shrink-0 gap-1.5">
                          <button
                            onClick={() => addTopic(t)}
                            disabled={addedTopics.has(t)}
                            className="rounded-md border border-accent-deep px-2.5 py-1 text-xs font-medium text-accent-deep hover:bg-tint disabled:opacity-50"
                          >
                            {addedTopics.has(t) ? "✓ 플랜에 추가됨" : "플랜에 추가"}
                          </button>
                          <Link
                            href={`/generate?channel=${encodeURIComponent(tChannel)}&title=${encodeURIComponent(t)}&keyword=${encodeURIComponent(firstSelectedKeyword)}`}
                            className="rounded-md bg-accent-deep px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                          >
                            ✍️ 콘텐츠 생성
                          </Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 보관 키워드 테이블 */}
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-subtle text-left text-xs text-muted">
                    <tr>
                      <th className="w-10 px-3 py-2"></th>
                      <th className="px-3 py-2 font-medium">키워드</th>
                      <th className="px-3 py-2 text-right font-medium">
                        월 검색량
                      </th>
                      <th className="px-3 py-2 font-medium">경쟁도</th>
                      <th className="px-3 py-2 font-medium">출처</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                      <th className="px-3 py-2 font-medium">저장일</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pool.map((k) => {
                      const st = STATUS_LABELS[k.status] ?? {
                        label: k.status,
                        cls: "bg-subtle text-muted",
                      };
                      return (
                        <tr key={k.id} className="border-t border-border">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={poolSel.has(k.id)}
                              onChange={() => togglePool(k.id)}
                            />
                          </td>
                          <td className="px-3 py-2 font-medium text-ink">
                            {k.keyword}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {k.avg_monthly_searches?.toLocaleString() ?? "-"}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {k.competition ?? "-"}
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">
                              {SOURCE_LABELS[k.source ?? ""] ?? k.source ?? "-"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={[
                                "rounded-full px-2 py-0.5 text-xs font-medium",
                                st.cls,
                              ].join(" ")}
                            >
                              {st.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted">
                            {k.created_at?.slice(0, 10) ?? "-"}
                          </td>
                          <td className="px-3 py-2">
                            <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                              <Link
                                href={`/generate?title=${encodeURIComponent(k.keyword)}&keyword=${encodeURIComponent(k.keyword)}`}
                                className="rounded border border-border px-1.5 py-0.5 text-xs text-ink hover:bg-subtle"
                              >
                                ✍️ 글쓰기
                              </Link>
                              <button
                                onClick={() => removeKeyword(k.id)}
                                title="보관함에서 삭제"
                                className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-red-50 hover:text-red-500"
                              >
                                삭제
                              </button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
