"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useClientContext } from "@/components/providers/client-context";
import { saveKeywordToPool } from "@/lib/actions/keywords";
import type { KeywordReport } from "@/types/keyword-report";
import type { NaverKeywordIdea } from "@/lib/naver-ads";
import type { KeywordIdea } from "@/lib/google-ads";

// 검증된 팔레트 (CVD ΔE 72) — 네이버=브랜드 딥그린, 구글=블루
const C_NAVER = "#057A4E";
const C_GOOGLE = "#2a78d6";

function fmt(n: number | null | undefined): string {
  return n != null ? n.toLocaleString() : "-";
}

/** 12000 → 1.2만 */
function compact(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, "")}만`;
  return n.toLocaleString();
}

const GOOGLE_COMP: Record<string, string> = {
  LOW: "낮음",
  MEDIUM: "보통",
  HIGH: "높음",
};

/** 네이버 compIdx 표기 통일 (중간 → 보통) */
function naverComp(v: string | null | undefined): string {
  if (!v || v === "-") return "-";
  return v === "중간" ? "보통" : v;
}

/**
 * 포화도 등급 — 블로그 문서수 ÷ 월 검색량. 낮을수록 수요 대비 공급이 적다.
 * 임계값은 내부 휴리스틱: 황금 <0.3 / 좋음 <2 / 보통 <10 / 포화 ≥10
 */
function satGrade(ratio: number): { label: string; emoji: string; cls: string } {
  if (ratio < 0.3)
    return { label: "황금", emoji: "💎", cls: "bg-sky-50 text-sky-700" };
  if (ratio < 2)
    return { label: "좋음", emoji: "🟢", cls: "bg-emerald-50 text-emerald-700" };
  if (ratio < 10)
    return { label: "보통", emoji: "🟡", cls: "bg-amber-50 text-amber-700" };
  return { label: "포화", emoji: "🔴", cls: "bg-red-50 text-red-600" };
}

function compChipCls(label: string): string {
  if (label === "낮음") return "bg-emerald-50 text-emerald-700";
  if (label === "보통") return "bg-amber-50 text-amber-700";
  if (label === "높음") return "bg-red-50 text-red-600";
  return "bg-subtle text-muted";
}

type SaveState = "busy" | "saved" | "dup";

export function KeywordReportView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [input, setInput] = useState("");
  const [report, setReport] = useState<KeywordReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

  async function search() {
    const kw = input.trim();
    if (!kw || !selectedClientId) return;
    setBusy(true);
    setError("");
    setReport(null);
    setSaveStates({});
    try {
      const res = await fetch("/api/keywords/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw, clientId: selectedClientId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "리포트 생성에 실패했습니다.");
        return;
      }
      setReport(data.report as KeywordReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "리포트 생성 실패");
    } finally {
      setBusy(false);
    }
  }

  async function save(
    keyword: string,
    avgMonthlySearches: number | null,
    competition: string | null,
    source: "naver_ads" | "google_ads",
  ) {
    if (!selectedClientId || saveStates[keyword]) return;
    setSaveStates((prev) => ({ ...prev, [keyword]: "busy" }));
    const r = await saveKeywordToPool({
      clientId: selectedClientId,
      keyword,
      avgMonthlySearches,
      competition,
      source,
    });
    setSaveStates((prev) => {
      const next = { ...prev };
      if (r.ok) next[keyword] = r.duplicated ? "dup" : "saved";
      else delete next[keyword];
      return next;
    });
  }

  if (!selectedClientId) {
    return <p className="text-sm text-muted">상단에서 클라이언트를 선택하세요.</p>;
  }

  const naver = report?.naver;
  const google = report?.google;
  const docCounts = naver?.docCounts ?? null;
  const docOf = (kw: string): number | null => docCounts?.[kw] ?? null;
  const mainDoc = report
    ? (docOf(naver?.main?.keyword ?? "") ??
      docOf(google?.main?.keyword ?? "") ??
      docOf(report.keyword))
    : null;
  const mainSat =
    mainDoc != null && naver?.main && naver.main.monthlyTotal > 0
      ? mainDoc / naver.main.monthlyTotal
      : null;

  // 패널용 행: 메인 + 연관 (검색량 내림차순 정렬은 서버에서 완료)
  const naverRows: NaverKeywordIdea[] = naver
    ? [...(naver.main ? [naver.main] : []), ...naver.related]
    : [];
  const googleRows: KeywordIdea[] = google
    ? [...(google.main ? [google.main] : []), ...google.related]
    : [];

  const trendData = (google?.trend ?? []).map((v) => ({
    label: `${String(v.month).padStart(2, "0")}월`,
    검색량: v.searches,
  }));

  const naverSave = (r: NaverKeywordIdea) =>
    save(r.keyword, r.monthlyTotal, r.competition, "naver_ads");
  const googleSave = (r: KeywordIdea) =>
    save(r.keyword, r.avgMonthlySearches, r.competition, "google_ads");

  return (
    <div className="space-y-5">
      {/* 검색 */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && search()}
          placeholder="키워드 1개 입력. 예: 병원 마케팅"
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent-deep"
        />
        <button
          onClick={search}
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-lg bg-accent-deep px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "분석 중…" : "분석하기"}
        </button>
      </div>

      {/* 팁 배너 */}
      <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-ink">
        💡 <b>포화도 = 블로그 문서수 ÷ 월 검색량.</b> 💎황금·🟢좋음 키워드는 찾는
        사람은 많은데 글이 적어서 상위 노출 기회가 커요.
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          오류: {error}
        </p>
      )}

      {report && (
        <div className="space-y-5">
          {/* 헤더 + 메인 액션 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-ink">
              &ldquo;{report.keyword}&rdquo; 핵심 지표
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  save(
                    report.keyword,
                    naver?.main?.monthlyTotal ??
                      google?.main?.avgMonthlySearches ??
                      null,
                    naver?.main?.competition ?? google?.main?.competition ?? null,
                    naver?.main ? "naver_ads" : "google_ads",
                  )
                }
                disabled={!!saveStates[report.keyword]}
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-70"
              >
                {saveStates[report.keyword] === "busy"
                  ? "저장 중…"
                  : saveStates[report.keyword]
                    ? "⭐ 보관됨"
                    : "☆ 보관함"}
              </button>
              <WriteLink keyword={report.keyword} primary />
            </div>
          </div>

          {report.warnings.length > 0 && (
            <ul className="space-y-1 rounded-md bg-subtle px-3 py-2 text-xs text-muted">
              {report.warnings.map((w, i) => (
                <li key={i}>ⓘ {w}</li>
              ))}
            </ul>
          )}

          {/* KPI 4카드 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 네이버 월 검색량 */}
            <KpiCard label="🟢 네이버 월 검색량">
              <p className="font-mono text-2xl font-bold text-ink">
                {naver?.main ? compact(naver.main.monthlyTotal) : "-"}
              </p>
              {naver?.main && naver.main.monthlyTotal > 0 && (
                <>
                  <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full"
                      style={{
                        background: C_NAVER,
                        width: `${(naver.main.monthlyPc / naver.main.monthlyTotal) * 100}%`,
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        background: C_GOOGLE,
                        width: `${(naver.main.monthlyMobile / naver.main.monthlyTotal) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">
                    PC {compact(naver.main.monthlyPc)} · 모바일{" "}
                    {compact(naver.main.monthlyMobile)}
                  </p>
                </>
              )}
              {!naver?.main && (
                <p className="mt-1.5 text-[11px] text-muted">데이터 없음</p>
              )}
            </KpiCard>

            {/* 구글 월 검색량 */}
            <KpiCard label="🔵 구글 월 검색량">
              <p className="font-mono text-2xl font-bold text-ink">
                {google?.main?.avgMonthlySearches != null
                  ? compact(google.main.avgMonthlySearches)
                  : "-"}
              </p>
              <p className="mt-1.5 text-[11px] text-muted">
                {google?.main?.cpcLow != null && google?.main?.cpcHigh != null
                  ? `광고 입찰가 ${Math.round(google.main.cpcLow).toLocaleString()}~${Math.round(google.main.cpcHigh).toLocaleString()}원`
                  : "입찰가 정보 없음"}
              </p>
            </KpiCard>

            {/* 블로그 발행량 */}
            <KpiCard label="📄 블로그 발행량 (문서수)">
              <p className="font-mono text-2xl font-bold text-ink">
                {mainDoc != null ? fmt(mainDoc) : "-"}
              </p>
              <div className="mt-1.5">
                {mainSat != null ? <SatBadge ratio={mainSat} prefix="포화도 " /> : (
                  <p className="text-[11px] text-muted">
                    {docCounts ? "검색량 데이터 필요" : "오픈API 키 필요"}
                  </p>
                )}
              </div>
            </KpiCard>

            {/* 경쟁 강도 */}
            <KpiCard label="⚔️ 경쟁 강도">
              <div className="flex flex-wrap gap-1.5">
                <Chip cls={compChipCls(naverComp(naver?.main?.competition))}>
                  네이버 {naverComp(naver?.main?.competition)}
                </Chip>
                <Chip
                  cls={compChipCls(
                    google?.main?.competition
                      ? (GOOGLE_COMP[google.main.competition] ?? "-")
                      : "-",
                  )}
                >
                  구글{" "}
                  {google?.main?.competition
                    ? (GOOGLE_COMP[google.main.competition] ?? google.main.competition)
                    : "-"}
                </Chip>
              </div>
              {naver?.main && (
                <p className="mt-1.5 text-[11px] text-muted">
                  네이버 광고 {naver.main.avgAdDepth}개 노출 · 모바일 CTR{" "}
                  {naver.main.mobileCtr}%
                </p>
              )}
              {google?.main?.competitionIndex != null && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full"
                      style={{
                        background: C_NAVER,
                        width: `${google.main.competitionIndex}%`,
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-muted">
                    지수 {google.main.competitionIndex}
                  </span>
                </div>
              )}
            </KpiCard>
          </div>

          {/* 12개월 추이 */}
          {trendData.length > 1 && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold text-ink">
                📈 최근 12개월 검색량 추이{" "}
                <span className="font-normal text-muted">(구글 기준)</span>
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                상승 추세거나 시즌이 다가오는 키워드를 미리 잡으면 유리해요.
              </p>
              <div className="mt-3 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={trendData}
                    margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
                  >
                    <XAxis
                      dataKey="label"
                      fontSize={11}
                      stroke="#9aa5a0"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      formatter={(v) => Number(v).toLocaleString()}
                      contentStyle={{ fontSize: 12 }}
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    />
                    <Bar
                      dataKey="검색량"
                      fill={C_GOOGLE}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={64}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 네이버 / 구글 패널 */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* ── 네이버 ── */}
            <Panel
              title="🟢 네이버 키워드 리포트"
              count={naver?.related.length ?? 0}
            >
              {naverRows.length === 0 ? (
                <p className="text-sm text-muted">데이터가 없습니다.</p>
              ) : (
                <>
                  <BarList
                    title={`연관 키워드 검색량 TOP ${Math.min(naverRows.length, 10)}`}
                    color={C_NAVER}
                    items={naverRows.slice(0, 10).map((r) => ({
                      label: r.keyword,
                      value: r.monthlyTotal,
                    }))}
                  />

                  {/* 포화도 등급 요약 */}
                  {docCounts && (
                    <div className="flex flex-wrap gap-1.5">
                      {(["황금", "좋음", "보통", "포화"] as const).map((g) => {
                        const n = naverRows.filter((r) => {
                          const d = docOf(r.keyword);
                          return (
                            d != null &&
                            r.monthlyTotal > 0 &&
                            satGrade(d / r.monthlyTotal).label === g
                          );
                        }).length;
                        const sample = satGrade(
                          g === "황금" ? 0 : g === "좋음" ? 1 : g === "보통" ? 5 : 99,
                        );
                        return (
                          <Chip key={g} cls={sample.cls}>
                            {sample.emoji} {g} {n}개
                          </Chip>
                        );
                      })}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted">
                        <tr className="border-b border-border">
                          <th className="py-2 pr-2 font-medium">키워드</th>
                          <th className="py-2 pr-2 text-right font-medium">월검색</th>
                          <th className="py-2 pr-2 text-right font-medium">문서수</th>
                          <th className="py-2 pr-2 font-medium">포화도</th>
                          <th className="py-2 pr-2 font-medium">광고경쟁</th>
                          <th className="py-2 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {naverRows.map((r) => {
                          const d = docOf(r.keyword);
                          const sat =
                            d != null && r.monthlyTotal > 0
                              ? d / r.monthlyTotal
                              : null;
                          return (
                            <tr key={r.keyword} className="border-b border-border/60">
                              <td className="py-2 pr-2 font-medium text-ink">
                                {r.keyword}
                              </td>
                              <td className="py-2 pr-2 text-right">
                                <span className="font-mono font-semibold">
                                  {compact(r.monthlyTotal)}
                                </span>
                                <span className="block text-[10px] text-muted">
                                  PC {compact(r.monthlyPc)}·모{" "}
                                  {compact(r.monthlyMobile)}
                                </span>
                              </td>
                              <td className="py-2 pr-2 text-right font-mono text-muted">
                                {d != null ? fmt(d) : "-"}
                              </td>
                              <td className="py-2 pr-2">
                                {sat != null ? <SatBadge ratio={sat} /> : "-"}
                              </td>
                              <td className="py-2 pr-2">
                                <span
                                  className={[
                                    "rounded px-1.5 py-0.5 text-xs",
                                    compChipCls(naverComp(r.competition)),
                                  ].join(" ")}
                                >
                                  {naverComp(r.competition)}
                                </span>
                              </td>
                              <td className="py-2">
                                <RowActions
                                  state={saveStates[r.keyword]}
                                  onSave={() => naverSave(r)}
                                  keyword={r.keyword}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Panel>

            {/* ── 구글 ── */}
            <Panel
              title="🔵 구글 키워드 리포트"
              count={google?.related.length ?? 0}
            >
              {googleRows.length === 0 ? (
                <p className="text-sm text-muted">데이터가 없습니다.</p>
              ) : (
                <>
                  <BarList
                    title={`연관 키워드 검색량 TOP ${Math.min(googleRows.length, 10)}`}
                    color={C_GOOGLE}
                    items={googleRows.slice(0, 10).map((r) => ({
                      label: r.keyword,
                      value: r.avgMonthlySearches ?? 0,
                    }))}
                  />

                  {/* 경쟁 등급 요약 */}
                  <div className="flex flex-wrap gap-1.5">
                    {(["LOW", "MEDIUM", "HIGH"] as const).map((g) => {
                      const n = googleRows.filter((r) => r.competition === g).length;
                      return (
                        <Chip key={g} cls={compChipCls(GOOGLE_COMP[g])}>
                          경쟁 {GOOGLE_COMP[g]} {n}개
                        </Chip>
                      );
                    })}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted">
                        <tr className="border-b border-border">
                          <th className="py-2 pr-2 font-medium">키워드</th>
                          <th className="py-2 pr-2 text-right font-medium">월검색</th>
                          <th className="py-2 pr-2 font-medium">경쟁지수</th>
                          <th className="py-2 pr-2 text-right font-medium">문서수</th>
                          <th className="py-2 pr-2 text-right font-medium">
                            입찰가(원)
                          </th>
                          <th className="py-2 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {googleRows.map((r) => (
                          <tr key={r.keyword} className="border-b border-border/60">
                            <td className="py-2 pr-2 font-medium text-ink">
                              {r.keyword}
                            </td>
                            <td className="py-2 pr-2 text-right font-mono font-semibold">
                              {r.avgMonthlySearches != null
                                ? compact(r.avgMonthlySearches)
                                : "-"}
                            </td>
                            <td className="py-2 pr-2">
                              {r.competitionIndex != null ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="h-1.5 w-10 overflow-hidden rounded-full bg-subtle">
                                    <span
                                      className="block h-full rounded-full"
                                      style={{
                                        background: C_NAVER,
                                        width: `${r.competitionIndex}%`,
                                      }}
                                    />
                                  </span>
                                  <span className="font-mono text-xs text-muted">
                                    {r.competitionIndex}
                                  </span>
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="py-2 pr-2 text-right font-mono text-muted">
                              {docOf(r.keyword) != null ? fmt(docOf(r.keyword)) : "-"}
                            </td>
                            <td className="py-2 pr-2 text-right font-mono text-muted">
                              {r.cpcLow != null && r.cpcHigh != null
                                ? `${Math.round(r.cpcLow).toLocaleString()}~${Math.round(r.cpcHigh).toLocaleString()}`
                                : "-"}
                            </td>
                            <td className="py-2">
                              <RowActions
                                state={saveStates[r.keyword]}
                                onSave={() => googleSave(r)}
                                keyword={r.keyword}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Panel>
          </div>

          <p className="text-right text-xs text-muted">
            {selectedClient?.name} · 네이버 검색광고 + Google Ads
            {docCounts ? " + 네이버 오픈API" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-2 text-xs font-medium text-muted">{label}</p>
      {children}
    </div>
  );
}

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <span className="text-xs text-muted">연관 {count}개</span>
      </div>
      {children}
    </div>
  );
}

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span
      className={["rounded-full px-2 py-0.5 text-xs font-medium", cls].join(" ")}
    >
      {children}
    </span>
  );
}

function SatBadge({ ratio, prefix }: { ratio: number; prefix?: string }) {
  const g = satGrade(ratio);
  return (
    <span
      className={["rounded-full px-2 py-0.5 text-xs font-medium", g.cls].join(" ")}
      title={`포화도 ${ratio.toFixed(1)} (문서수÷검색량)`}
    >
      {g.emoji} {prefix}
      {g.label}
    </span>
  );
}

/** 가로 막대 리스트 (키워드 | 막대 | 값) */
function BarList({
  title,
  items,
  color,
}: {
  title: string;
  items: { label: string; value: number }[];
  color: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted">{title}</p>
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-ink" title={it.label}>
            {it.label}
          </span>
          <span className="h-4 flex-1 overflow-hidden rounded bg-subtle">
            <span
              className="block h-full rounded"
              style={{
                background: color,
                width: `${Math.max((it.value / max) * 100, 2)}%`,
              }}
            />
          </span>
          <span className="w-12 shrink-0 text-right font-mono text-muted">
            {compact(it.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function WriteLink({
  keyword,
  primary,
}: {
  keyword: string;
  primary?: boolean;
}) {
  const href = `/generate?title=${encodeURIComponent(keyword)}&keyword=${encodeURIComponent(keyword)}`;
  return (
    <Link
      href={href}
      className={
        primary
          ? "rounded-md bg-accent-deep px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          : "shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-ink hover:bg-subtle"
      }
    >
      ✍️ {primary ? "이 키워드로 글쓰기" : "글쓰기"}
    </Link>
  );
}

function RowActions({
  state,
  onSave,
  keyword,
}: {
  state?: SaveState;
  onSave: () => void;
  keyword: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
      <button
        onClick={onSave}
        disabled={!!state}
        title={state ? "보관함에 저장됨" : "보관함에 저장"}
        className="rounded px-1 text-base leading-none text-amber-500 hover:bg-subtle disabled:cursor-default"
      >
        {state === "busy" ? "…" : state ? "★" : "☆"}
      </button>
      <WriteLink keyword={keyword} />
    </div>
  );
}
