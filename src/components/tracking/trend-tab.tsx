"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import {
  CHART_COLORS,
  CHART_METRICS,
  INTENT_ORDER,
  RANK_METRICS,
  RANK_SURFACES,
  SUMMARY_METRICS,
  TREND_WEEKS,
  deltaPoints,
  fetchAllRows,
  findMetric,
  fmtRatio,
  formatValue,
  intentLabel,
  latestWeeks,
  metricLabel,
  pct,
  surfaceLabel,
  topDomains,
  uniqueSorted,
  unlistedEntities,
} from "@/lib/tracker";
import type {
  TrackerObservation,
  TrackerRankObservation,
  TrackerWeeklyMetric,
} from "@/types/tracker";
import { DataTable, Notice, Section, Select, StatCard } from "./ui";

type ObsLite = Pick<TrackerObservation, "obs_id" | "surface" | "week" | "citations" | "entities">;
type RankLite = Pick<
  TrackerRankObservation,
  "keyword_id" | "keyword_text" | "intent" | "surface" | "best_position" | "best_section" | "best_section_rank" | "error" | "week"
>;
type WeeklyState = { rows: TrackerWeeklyMetric[]; error: string | null };

/**
 * 최근 실행의 주 → 최신 TREND_WEEKS 주 → 그 주들의 집계만 페이지로 모은다.
 * 전체를 한 번에 select 하면 max-rows 에 잘려 최신 주가 조용히 빠진다 (주당 수백 행).
 */
async function loadWeekly(clientId: string): Promise<WeeklyState> {
  const supabase = createClient();
  const runs = await supabase
    .from("tracker_runs")
    .select("week")
    .eq("client_id", clientId)
    .order("started_at", { ascending: false })
    .limit(200);
  if (runs.error) return { rows: [], error: runs.error.message };
  const weeks = latestWeeks((runs.data ?? []).map((r) => String(r.week)));
  if (weeks.length === 0) return { rows: [], error: null };
  return fetchAllRows<TrackerWeeklyMetric>((from, to) =>
    supabase
      .from("tracker_weekly_metrics")
      .select("*")
      .eq("client_id", clientId)
      .in("week", weeks)
      .order("week")
      .order("surface")
      .order("intent")
      .order("metric")
      .range(from, to),
  );
}

/** 추세: 검색 순위 요약 → AI 노출 지표(표면·의도 선택) → 주간 추이 → 경쟁사·인용 도메인·미등록 업체 */
export function TrendTab({
  clientId,
  clientName,
  scope,
}: {
  clientId: string;
  clientName: string;
  /** geo = AI 노출, seo = 검색 순위 */
  scope: "geo" | "seo";
}) {
  // weekly 가 null 이면 아직 불러오는 중 (고객사가 바뀌면 부모가 key 로 다시 그린다)
  const [weekly, setWeekly] = useState<WeeklyState | null>(null);
  const [surface, setSurface] = useState("");
  const [intent, setIntent] = useState("all");
  const [obsState, setObsState] = useState<{ week: string; rows: ObsLite[]; error: string | null }>({ week: "", rows: [], error: null });
  const [rankState, setRankState] = useState<{ key: string; rows: RankLite[]; error: string | null }>({ key: "", rows: [], error: null });
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    loadWeekly(clientId).then((next) => {
      if (active) setWeekly(next);
    });
    return () => {
      active = false;
    };
  }, [clientId]);

  const rows = useMemo(() => weekly?.rows ?? [], [weekly]);
  const geo = useMemo(() => rows.filter((r) => !RANK_SURFACES.has(r.surface)), [rows]);
  const rank = useMemo(() => rows.filter((r) => RANK_SURFACES.has(r.surface)), [rows]);
  const surfaces = useMemo(() => uniqueSorted(geo.map((r) => r.surface)), [geo]);
  const activeSurface = surfaces.includes(surface) ? surface : (surfaces[0] ?? "");
  const intents = useMemo(() => {
    const present = new Set(geo.filter((r) => r.surface === activeSurface).map((r) => r.intent));
    return INTENT_ORDER.filter((i) => present.has(i));
  }, [geo, activeSurface]);
  const activeIntent = intents.includes(intent) ? intent : (intents[0] ?? "all");
  const sel = useMemo(
    () => geo.filter((r) => r.surface === activeSurface && r.intent === activeIntent),
    [geo, activeSurface, activeIntent],
  );
  const weeks = useMemo(() => uniqueSorted(sel.map((r) => r.week)), [sel]);
  const latest = weeks[weeks.length - 1];
  const prev = weeks.length > 1 ? weeks[weeks.length - 2] : undefined;

  const rankWeeks = useMemo(() => uniqueSorted(rank.map((r) => r.week)), [rank]);
  const rankLatest = rankWeeks[rankWeeks.length - 1];
  const rankPrev = rankWeeks.length > 1 ? rankWeeks[rankWeeks.length - 2] : undefined;

  // 최근 주 관측(인용·업체명)과 검색 순위 관측은 주가 정해진 뒤에 불러온다
  useEffect(() => {
    if (!latest) return;
    let active = true;
    const supabase = createClient();
    fetchAllRows<ObsLite>((from, to) =>
      supabase
        .from("tracker_observations")
        .select("obs_id, surface, week, citations, entities")
        .eq("client_id", clientId)
        .eq("week", latest)
        .order("obs_id")
        .range(from, to),
    ).then((res) => {
      if (active) setObsState({ week: latest, rows: res.rows, error: res.error });
    });
    return () => {
      active = false;
    };
  }, [clientId, latest]);

  const rankKey = rankLatest ? `${rankLatest}|${rankPrev ?? ""}` : "";
  useEffect(() => {
    if (!rankLatest) return;
    let active = true;
    const wks = rankPrev ? [rankLatest, rankPrev] : [rankLatest];
    const supabase = createClient();
    fetchAllRows<RankLite>((from, to) =>
      supabase
        .from("tracker_rank_observations")
        .select("keyword_id, keyword_text, intent, surface, best_position, best_section, best_section_rank, error, week")
        .eq("client_id", clientId)
        .in("week", wks)
        .order("keyword_id")
        .order("obs_id")
        .range(from, to),
    ).then((res) => {
      if (active) setRankState({ key: `${rankLatest}|${rankPrev ?? ""}`, rows: res.rows, error: res.error });
    });
    return () => {
      active = false;
    };
  }, [clientId, rankLatest, rankPrev]);

  const obsReady = Boolean(latest) && obsState.week === latest;
  const obs = obsReady ? obsState.rows : [];
  const obsError = obsReady ? obsState.error : null;
  const rankReady = Boolean(rankKey) && rankState.key === rankKey;
  const rankObs = rankReady ? rankState.rows : [];
  const rankError = rankReady ? rankState.error : null;

  if (weekly === null) return <p className="text-sm text-muted">불러오는 중…</p>;
  // 질의 오류를 '데이터 없음' 으로 보이게 하지 않는다
  if (weekly.error) return <Notice kind="error">집계를 불러오지 못했습니다: {weekly.error}</Notice>;
  if (scope === "seo") {
    if (rank.length === 0 || !rankLatest) {
      return <Notice kind="info">아직 검색 순위 집계가 없습니다. 트래커에 검색어를 등록하고 실행하면 나타납니다.</Notice>;
    }
    return (
      <div className="space-y-5">
        {rankError && <Notice kind="error">검색 순위 관측을 불러오지 못했습니다: {rankError}</Notice>}
        <RankSection rank={rank} latest={rankLatest} prev={rankPrev} rankObs={rankObs} />
      </div>
    );
  }
  if (geo.length === 0) {
    return (
      <Notice kind="info">
        아직 AI 노출 집계가 없습니다. 실행이 끝나면 자동으로 판정·집계돼 여기에 나타납니다.
      </Notice>
    );
  }

  const chartData = weeks.map((w) => {
    const row: Record<string, string | number | null> = { week: w };
    for (const m of CHART_METRICS) {
      const v = findMetric(sel, w, activeSurface, activeIntent, m)?.value;
      row[m] = v == null ? null : Math.round(v * 1000) / 10;
    }
    return row;
  });

  const compRows = latest
    ? sel
        .filter((r) => r.week === latest && r.metric.startsWith("competitor_mention_rate:"))
        .map((r) => ({ name: r.metric.split(":", 2)[1], rate: r.value }))
    : [];
  const brandRate = latest ? findMetric(sel, latest, activeSurface, activeIntent, "mention_rate")?.value : null;
  const bars = [{ name: `${clientName} (우리)`, rate: brandRate ?? null }, ...compRows]
    .filter((b) => b.rate != null)
    .map((b) => ({ name: b.name, rate: Math.round((b.rate as number) * 100), label: `${Math.round((b.rate as number) * 100)}%` }));

  const domains = topDomains(obs.filter((o) => o.surface === activeSurface) as TrackerObservation[]);
  const unlisted = unlistedEntities(obs as TrackerObservation[]);
  const fullRows = latest ? sel.filter((r) => r.week === latest) : [];

  return (
    <div className="space-y-5">
      {(
        <>
          <Section title="AI 노출">
            <div className="flex flex-wrap items-end gap-4">
              <Select
                label="표면"
                value={activeSurface}
                onChange={setSurface}
                options={surfaces.map((s) => ({ value: s, label: surfaceLabel(s) }))}
              />
              <div className="flex flex-col gap-1 text-xs text-muted">
                의도
                <div className="flex flex-wrap gap-1">
                  {intents.map((i) => (
                    <button
                      key={i}
                      onClick={() => setIntent(i)}
                      className={[
                        "rounded-full border px-3 py-1 text-sm",
                        i === activeIntent
                          ? "border-accent-deep bg-accent-deep text-white"
                          : "border-border bg-surface text-muted hover:text-ink",
                      ].join(" ")}
                    >
                      {intentLabel(i)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">
              {clientName} · {surfaceLabel(activeSurface)} · {intentLabel(activeIntent)} · 최근 주 {latest}
              {prev ? ` (전주 ${prev} 대비)` : " · 비교할 전주 없음"}
            </p>
          </Section>

          {sel.length === 0 ? (
            <Notice kind="info">이 조합에는 관측이 없습니다.</Notice>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {SUMMARY_METRICS.map((m) => {
                  const row = latest ? findMetric(sel, latest, activeSurface, activeIntent, m) : undefined;
                  const prow = prev ? findMetric(sel, prev, activeSurface, activeIntent, m) : undefined;
                  return (
                    <StatCard
                      key={m}
                      label={metricLabel(m)}
                      value={pct(row?.value)}
                      delta={deltaPoints(row?.value, prow?.value)}
                      caption={row ? fmtRatio(row.numerator, row.denominator) : undefined}
                    />
                  );
                })}
              </div>

              <Section title="주간 추이 (%)" right={<span className="text-xs text-muted">최근 {TREND_WEEKS}주</span>}>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => (v == null ? "-" : `${v}%`)} />
                      <Legend />
                      {CHART_METRICS.map((m, i) => (
                        <Line
                          key={m}
                          type="monotone"
                          dataKey={m}
                          name={metricLabel(m)}
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          strokeWidth={2}
                          connectNulls={false}
                          dot={{ r: 3 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {weeks.length < 4 && (
                  <p className="mt-2 text-xs text-muted">추세는 4주 이상 쌓여야 읽을 수 있습니다. 지금 {weeks.length}주.</p>
                )}
              </Section>

              {obsError && <Notice kind="error">최근 주 관측을 불러오지 못했습니다: {obsError}</Notice>}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Section title="경쟁사 대비 언급률 (최근 주)">
                  {bars.length === 0 ? (
                    <p className="text-sm text-muted">경쟁사가 등록되지 않았거나 값이 없습니다.</p>
                  ) : (
                    <div style={{ height: 60 + 36 * bars.length }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                          <Tooltip formatter={(v) => `${v}%`} />
                          <Bar dataKey="rate" fill="#2563eb" radius={[0, 3, 3, 0]}>
                            <LabelList dataKey="label" position="right" style={{ fontSize: 12 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Section>
                <Section title="많이 인용된 도메인 (최근 주)">
                  <DataTable
                    header={["도메인", "인용 수"]}
                    empty="인용이 없습니다."
                    dense
                    rows={domains.map(([d, n]) => [d, n])}
                  />
                </Section>
              </div>

              <Section title="AI가 언급한 다른 업체 (최근 주, 등록되지 않은 이름)">
                <DataTable
                  header={["업체명", "등장 관측 수"]}
                  empty="없음"
                  dense
                  rows={unlisted.map(([name, n]) => [name, n])}
                />
                {unlisted.length > 0 && (
                  <p className="mt-2 text-xs text-muted">{"경쟁사로 등록하려면 맥의 트래커 앱 → 추세 화면에서 '경쟁사로 등록하고 다시 판정'."}</p>
                )}
              </Section>

              <Section
                title="최근 주 전체 지표"
                right={
                  <button onClick={() => setShowAll((v) => !v)} className="text-xs text-accent-deep hover:underline">
                    {showAll ? "접기" : "펼치기"}
                  </button>
                }
              >
                {showAll && (
                  <DataTable
                    header={["지표", "값", "분자/분모"]}
                    dense
                    rows={fullRows.map((r) => [metricLabel(r.metric), formatValue(r.metric, r.value), fmtRatio(r.numerator, r.denominator)])}
                  />
                )}
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function RankSection({
  rank,
  latest,
  prev,
  rankObs,
}: {
  rank: TrackerWeeklyMetric[];
  latest: string;
  prev?: string;
  rankObs: RankLite[];
}) {
  const surfaces = uniqueSorted(rank.map((r) => r.surface));
  const summary = surfaces.map((s) => {
    const cells: string[] = [surfaceLabel(s)];
    for (const m of RANK_METRICS) {
      const row = findMetric(rank, latest, s, "all", m);
      let text = row && row.value != null ? formatValue(m, row.value) : "해당 없음";
      if (row && m !== "rank_avg_best_position") text += `  (${fmtRatio(row.numerator, row.denominator)})`;
      cells.push(text);
    }
    return cells;
  });

  const latestObs = rankObs.filter((o) => o.week === latest);
  const prevBest = new Map<string, number | null>();
  for (const o of rankObs.filter((o) => o.week === prev)) prevBest.set(`${o.keyword_id}|${o.surface}`, o.best_position);
  const byKeyword = new Map<string, { text: string; intent: string; cells: Map<string, string> }>();
  for (const o of latestObs) {
    const entry = byKeyword.get(o.keyword_id) ?? { text: o.keyword_text ?? o.keyword_id, intent: o.intent ?? "", cells: new Map() };
    let cell: string;
    if (o.error) cell = "오류";
    else if (o.best_position) {
      const pv = prevBest.get(`${o.keyword_id}|${o.surface}`);
      const arrow = pv ? (pv > o.best_position ? "▲" : pv < o.best_position ? "▼" : "＝") : "";
      cell = `${o.best_position}위 · ${o.best_section ?? ""} ${o.best_section_rank ?? ""}위${pv ? ` (${arrow}${pv}위)` : ""}`;
    } else cell = "없음";
    entry.cells.set(o.surface, cell);
    byKeyword.set(o.keyword_id, entry);
  }
  const rankSurfaces = uniqueSorted(latestObs.map((o) => o.surface));

  return (
    <Section title="검색 순위">
      <DataTable
        header={["표면", ...RANK_METRICS.map(metricLabel)]}
        dense
        rows={summary}
      />
      {byKeyword.size > 0 && (
        <div className="mt-4">
          <DataTable
            header={["검색어", "의도", ...rankSurfaces.map((s) => surfaceLabel(s).replace(" 검색 순위", ""))]}
            dense
            rows={Array.from(byKeyword.values()).map((k) => [k.text, k.intent, ...rankSurfaces.map((s) => k.cells.get(s) ?? "")])}
          />
          <p className="mt-2 text-xs text-muted">
            {`${latest} 기준. '위'는 화면에 보이는 순서(광고·플레이스 포함), 괄호는 영역 안 순서. 전주 값은 괄호 뒤.`}
          </p>
        </div>
      )}
    </Section>
  );
}
