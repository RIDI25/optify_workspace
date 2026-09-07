"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABELS, fetchAllRows, runHasScope, surfaceLabel } from "@/lib/tracker";
import { buildGeoDigest, buildSeoDigest, pct, type RunDigest } from "@/lib/tracker-digest";
import type { TrackerInsight, TrackerObservation, TrackerRankObservation, TrackerRun } from "@/types/tracker";
import type { TrackingScope } from "./tracking-view";
import { DataTable, Notice, Section, StatCard } from "./ui";

function fmtDateTime(iso: string | null): { date: string; time: string; dow: string } {
  if (!iso) return { date: "-", time: "", dow: "" };
  const d = new Date(iso);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return {
    date: `${d.getMonth() + 1}/${d.getDate()}`,
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    dow,
  };
}

/** 간단 마크다운: ## 제목, - 불릿, 그 외 문단 (추론 결과 표시용) */
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="mb-2 list-disc space-y-0.5 pl-5">
          {list.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const l = raw.replace(/\*\*/g, "").trimEnd();
    if (/^#{1,3} /.test(l)) {
      flush();
      out.push(
        <h3 key={i} className="mb-1 mt-3 text-sm font-semibold text-accent-deep first:mt-0">
          {l.replace(/^#{1,3} /, "")}
        </h3>,
      );
    } else if (/^[-*] /.test(l)) list.push(l.slice(2));
    else if (l.trim()) {
      flush();
      out.push(
        <p key={i} className="mb-1.5">
          {l}
        </p>,
      );
    }
  });
  flush();
  return <div className="text-sm leading-relaxed text-ink">{out}</div>;
}

/** 측정 기록 — 날짜·시간별 측정 목록, 고른 측정의 표·그래프, 추론(Claude Fable), 고객사 전달용 PDF */
export function RecordsTab({ clientId, scope, runs }: { clientId: string; scope: TrackingScope; runs: TrackerRun[] }) {
  const scoped = useMemo(() => runs.filter((r) => runHasScope(r, scope)), [runs, scope]);
  const [picked, setPicked] = useState<string>("");
  const run = scoped.find((r) => r.run_id === picked) ?? scoped[0];
  const runId = run?.run_id ?? "";

  const [digestState, setDigestState] = useState<{ runId: string; digest: RunDigest | null; error: string | null }>({ runId: "", digest: null, error: null });
  const [insights, setInsights] = useState<{ key: string; rows: TrackerInsight[]; missing: boolean }>({ key: "", rows: [], missing: false });
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!runId) return;
    let active = true;
    const supabase = createClient();
    (async () => {
      if (scope === "seo") {
        const r = await fetchAllRows<TrackerRankObservation>((from, to) =>
          supabase.from("tracker_rank_observations").select("*").eq("run_id", runId).order("collected_at").order("obs_id").range(from, to),
        );
        if (active) setDigestState({ runId, digest: r.error ? null : buildSeoDigest(r.rows), error: r.error });
      } else {
        const r = await fetchAllRows<TrackerObservation>((from, to) =>
          supabase.from("tracker_observations").select("*").eq("run_id", runId).order("collected_at").order("obs_id").range(from, to),
        );
        if (active) setDigestState({ runId, digest: r.error ? null : buildGeoDigest(r.rows), error: r.error });
      }
    })();
    return () => {
      active = false;
    };
  }, [runId, scope]);

  const insightKey = `${clientId}|${scope}`;
  useEffect(() => {
    let active = true;
    createClient()
      .from("tracker_insights")
      .select("*")
      .eq("client_id", clientId)
      .eq("scope", scope)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (active) setInsights({ key: insightKey, rows: (data ?? []) as TrackerInsight[], missing: Boolean(error) });
      });
    return () => {
      active = false;
    };
  }, [clientId, scope, insightKey]);

  async function generate() {
    if (!runId) return;
    setGenBusy(true);
    setGenMsg("");
    try {
      const res = await fetch("/api/tracker/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, scope, runId }),
      });
      const d = await res.json();
      if (!d.ok) {
        setGenMsg(d.error ?? "추론 실패");
        return;
      }
      const row: TrackerInsight = d.row ?? {
        id: `tmp-${Date.now()}`,
        client_id: clientId,
        scope,
        run_id: runId,
        model: d.model ?? null,
        insight: d.insight,
        input_tokens: null,
        output_tokens: null,
        created_by: null,
        created_at: new Date().toISOString(),
      };
      setInsights((prev) => ({ key: insightKey, rows: [row, ...prev.rows], missing: false }));
      setGenMsg(d.saved ? `추론 완료 (${d.model})` : `추론 완료 (${d.model}) · ${d.warning ?? "저장 안 됨"}`);
    } catch (e) {
      setGenMsg(e instanceof Error ? e.message : "추론 실패");
    } finally {
      setGenBusy(false);
    }
  }

  function openPdf() {
    if (!runId) return;
    window.open(`/api/tracker/report-pdf?clientId=${encodeURIComponent(clientId)}&scope=${scope}&runId=${encodeURIComponent(runId)}`, "_blank");
  }

  if (scoped.length === 0) {
    return <Notice kind="info">{scope === "seo" ? "검색 순위" : "AI 노출"} 측정 기록이 아직 없습니다. 위의 &lsquo;지금 실행&rsquo;을 누르거나 매주 자동 측정을 켜 두세요.</Notice>;
  }

  const digest = digestState.runId === runId ? digestState.digest : null;
  const digestError = digestState.runId === runId ? digestState.error : null;
  const rowsIns = insights.key === insightKey ? insights.rows : [];
  const forRun = rowsIns.filter((i) => i.run_id === runId);
  const latestIns = forRun[0] ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
      {/* 날짜·시간별 측정 목록 */}
      <section className="rounded-lg border border-border bg-surface p-2">
        <p className="px-2 py-1 text-xs font-semibold text-muted">측정 기록 · {scoped.length}건 <span className="font-normal">(한국 시간)</span></p>
        <ul className="max-h-[70vh] space-y-0.5 overflow-y-auto">
          {scoped.map((r) => {
            const t = fmtDateTime(r.started_at);
            const on = r.run_id === runId;
            const hasIns = rowsIns.some((i) => i.run_id === r.run_id);
            return (
              <li key={r.run_id}>
                <button
                  onClick={() => setPicked(r.run_id)}
                  className={["w-full rounded-md px-2 py-1.5 text-left text-sm", on ? "bg-tint text-accent-deep" : "hover:bg-subtle"].join(" ")}
                >
                  <span className="flex items-center justify-between">
                    <span className="font-medium">
                      {t.date} ({t.dow}) {t.time}
                    </span>
                    <span className={["text-[10px]", r.status === "done" ? "text-emerald-700" : r.status === "failed" ? "text-red-600" : "text-muted"].join(" ")}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {scope === "seo" ? "검색 순위 측정" : `관측 ${r.observations} · 노출 ${r.present}`}
                    {r.errors ? ` · 오류 ${r.errors}` : ""}
                    {hasIns ? " · 추론 있음" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="space-y-4">
        {run && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">
                {fmtDateTime(run.started_at).date} ({fmtDateTime(run.started_at).dow}) {fmtDateTime(run.started_at).time} 측정 · {run.surfaces.map(surfaceLabel).join(" · ")}
              </p>
              <p className="text-xs text-muted">
                {run.run_id} · {STATUS_LABELS[run.status] ?? run.status}
                {run.break_note ? ` · ${run.break_note}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={generate} disabled={genBusy} className="rounded-md border border-accent px-3 py-1.5 text-sm font-semibold text-accent-deep hover:bg-tint disabled:opacity-50">
                {genBusy ? "추론 중… (1~2분)" : latestIns ? "추론 다시 생성" : "추론 생성 (Claude)"}
              </button>
              <button onClick={openPdf} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">
                리포트 PDF
              </button>
            </div>
          </div>
        )}
        {genMsg && <p className="text-xs text-muted">{genMsg}</p>}

        {digestError && <Notice kind="error">불러오지 못했습니다: {digestError}</Notice>}
        {!digest && !digestError && <p className="text-sm text-muted">불러오는 중…</p>}

        {digest?.kind === "geo" && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="AI 관측" value={digest.totals.observed} caption={digest.totals.errors ? `오류 ${digest.totals.errors} 제외` : undefined} />
              <StatCard label="AI 답변 노출" value={digest.totals.present} caption={pct(digest.totals.observed ? digest.totals.present / digest.totals.observed : null)} />
              <StatCard label="우리 언급" value={digest.totals.mention} caption={`노출 중 ${pct(digest.totals.present ? digest.totals.mention / digest.totals.present : null)}`} />
              <StatCard label="우리 인용" value={digest.totals.citation} caption={`노출 중 ${pct(digest.totals.present ? digest.totals.citation / digest.totals.present : null)}`} />
            </div>
            <Section title="표면별 (%)">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={digest.surfaces.map((s) => ({ name: surfaceLabel(s.surface), 노출률: Math.round((s.presentRate ?? 0) * 100), 언급률: Math.round((s.mentionRate ?? 0) * 100), 인용률: Math.round((s.citationRate ?? 0) * 100) }))} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Legend />
                    <Bar dataKey="노출률" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="언급률" fill="#2563eb" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="인용률" fill="#0d9488" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <DataTable
                header={["표면", "관측", "노출", "언급", "인용", "노출률", "언급률", "인용률"]}
                dense
                rows={digest.surfaces.map((s) => [surfaceLabel(s.surface), s.observed, s.present, s.mention, s.citation, pct(s.presentRate), pct(s.mentionRate), pct(s.citationRate)])}
              />
            </Section>
            <Section title="질문별 결과">
              <DataTable
                header={["질문", "의도", ...digest.surfaces.map((s) => surfaceLabel(s.surface))]}
                dense
                rows={digest.prompts.map((p) => [
                  p.text,
                  p.intent,
                  ...digest.surfaces.map((s) => {
                    const c = p.cells[s.surface];
                    if (!c) return "-";
                    if (c.error) return <span key={s.surface} className="text-red-600">오류</span>;
                    return (
                      <span key={s.surface} className="flex flex-wrap gap-1">
                        <Chip on={c.present > 0} label={c.present > 0 ? "노출" : "미노출"} />
                        {c.present > 0 && <Chip on={c.mention > 0} label="언급" />}
                        {c.present > 0 && <Chip on={c.citation > 0} label="인용" />}
                        {c.competitors.length > 0 && <span className="text-[11px] text-amber-700">경쟁: {c.competitors.join(", ")}</span>}
                      </span>
                    );
                  }),
                ])}
              />
              {(digest.competitorMentions.length > 0 || digest.topDomains.length > 0) && (
                <p className="mt-2 text-xs text-muted">
                  {digest.competitorMentions.length > 0 && <>경쟁사 언급: {digest.competitorMentions.map(([n, c]) => `${n} ${c}회`).join(", ")}. </>}
                  {digest.topDomains.length > 0 && <>많이 인용된 출처: {digest.topDomains.slice(0, 6).map(([n, c]) => `${n} ${c}`).join(", ")}.</>}
                </p>
              )}
            </Section>
          </>
        )}

        {digest?.kind === "seo" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="검색어" value={digest.totals.keywords} />
              <StatCard label="첫 화면 노출" value={digest.totals.found} caption="검색어 × 표면" />
              <StatCard label="10위 안" value={digest.totals.top10} />
            </div>
            <Section title="검색어별 최고 순위 (낮을수록 좋음)">
              <div style={{ height: 80 + 28 * digest.keywords.length }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={digest.keywords.map((k) => {
                      const row: Record<string, string | number | null> = { name: k.text };
                      for (const s of digest.surfaces) row[surfaceLabel(s.surface).replace(" 검색 순위", "")] = k.cells[s.surface]?.best ?? null;
                      return row;
                    })}
                    margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, "dataMax + 2"]} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => (v == null ? "없음" : `${v}위`)} />
                    <Legend />
                    {digest.surfaces.map((s, i) => (
                      <Bar key={s.surface} dataKey={surfaceLabel(s.surface).replace(" 검색 순위", "")} fill={["#2563eb", "#0d9488", "#d97706"][i % 3]} radius={[0, 3, 3, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <DataTable
                header={["검색어", "의도", ...digest.surfaces.map((s) => surfaceLabel(s.surface).replace(" 검색 순위", ""))]}
                dense
                rows={digest.keywords.map((k) => [
                  k.text,
                  k.intent,
                  ...digest.surfaces.map((s) => {
                    const c = k.cells[s.surface];
                    if (!c) return "-";
                    if (c.error) return <span key={s.surface} className="text-red-600">오류</span>;
                    return c.best != null ? `${c.best}위 · ${c.section ?? ""} ${c.sectionRank ?? ""}위` : <span key={s.surface} className="text-muted">없음</span>;
                  }),
                ])}
              />
              <DataTable
                header={["표면", "검색어", "노출", "3위 안", "10위 안", "평균 최고 순위"]}
                dense
                rows={digest.surfaces.map((s) => [surfaceLabel(s.surface), s.keywords, s.found, s.top3, s.top10, s.avgBest == null ? "-" : `${s.avgBest.toFixed(1)}위`])}
              />
            </Section>
          </>
        )}

        <Section
          title={`추론 결과 (Claude)${latestIns?.model ? ` · ${latestIns.model}` : ""}`}
          right={
            rowsIns.length > 1 ? (
              <button onClick={() => setShowHistory((v) => !v)} className="text-xs text-accent-deep hover:underline">
                {showHistory ? "이전 추론 닫기" : `이전 추론 ${rowsIns.length - 1}개`}
              </button>
            ) : undefined
          }
        >
          {insights.key === insightKey && insights.missing ? (
            <Notice kind="warn">추론 저장 표가 없습니다. supabase/migrations/0030_tracker_insights.sql 을 실행하면 저장·이력이 됩니다.</Notice>
          ) : latestIns ? (
            <>
              <Markdown text={latestIns.insight} />
              <p className="mt-2 text-[11px] text-muted">
                {new Date(latestIns.created_at).toLocaleString("ko-KR")} 작성 · 이 측정({runId}) 기준
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">이 측정에 대한 추론이 아직 없습니다. &lsquo;추론 생성&rsquo;을 누르면 Claude 가 표의 숫자만 근거로 해석과 다음 조치를 씁니다.</p>
          )}
          {showHistory && rowsIns.length > 1 && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {rowsIns.slice(1, 6).map((i) => (
                <details key={i.id} className="rounded-md bg-subtle px-3 py-2">
                  <summary className="cursor-pointer text-xs text-muted">
                    {new Date(i.created_at).toLocaleString("ko-KR")} · {i.run_id ?? "-"} · {i.model ?? ""}
                  </summary>
                  <div className="mt-2">
                    <Markdown text={i.insight} />
                  </div>
                </details>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Chip({ on, label }: { on: boolean; label: string }) {
  return <span className={["rounded-full px-1.5 py-px text-[11px]", on ? "bg-emerald-50 text-emerald-700" : "bg-subtle text-muted"].join(" ")}>{label}</span>;
}
