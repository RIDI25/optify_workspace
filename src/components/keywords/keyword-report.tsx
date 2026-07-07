"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useClientContext } from "@/components/providers/client-context";
import { saveKeywordToPool } from "@/lib/actions/keywords";
import type { KeywordReport } from "@/types/keyword-report";

// 검증된 2색 팔레트 (CVD ΔE 72) — PC=브랜드 딥그린, 모바일=블루
const C_PC = "#057A4E";
const C_MOBILE = "#2a78d6";
const C_GRID = "#e4e9e7";

function fmt(n: number | null | undefined): string {
  return n != null ? n.toLocaleString() : "-";
}

/** 축 눈금용 축약 (12000 → 1.2만) */
function compact(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, "")}만`;
  return n.toLocaleString();
}

const GOOGLE_COMP: Record<string, string> = {
  LOW: "낮음",
  MEDIUM: "중간",
  HIGH: "높음",
};

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
  const mainDoc =
    docCounts && report
      ? (docCounts[naver?.main?.keyword ?? ""] ?? docCounts[report.keyword] ?? null)
      : null;
  const saturation =
    mainDoc != null && naver?.main && naver.main.monthlyTotal > 0
      ? mainDoc / naver.main.monthlyTotal
      : null;

  const naverBarData = (naver?.related ?? []).slice(0, 10).map((r) => ({
    keyword: r.keyword,
    PC: r.monthlyPc,
    모바일: r.monthlyMobile,
  }));

  const trendData = (google?.trend ?? []).map((v) => ({
    label: `${String(v.year).slice(2)}.${String(v.month).padStart(2, "0")}`,
    검색량: v.searches,
  }));

  return (
    <div className="space-y-6">
      {/* 검색 */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && search()}
          placeholder="키워드 1개 입력. 예: 병원 마케팅"
          className="w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
        />
        <button
          onClick={search}
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "분석 중…" : "리포트 조회"}
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          오류: {error}
        </p>
      )}

      {report && (
        <div className="space-y-6">
          {/* 헤더 + 메인 키워드 액션 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">
                &ldquo;{report.keyword}&rdquo; 키워드 리포트
              </h2>
              <p className="text-xs text-muted">
                {selectedClient?.name} · 네이버 검색광고 + Google Ads
              </p>
            </div>
            <div className="flex gap-2">
              <SaveButton
                state={saveStates[report.keyword]}
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
              />
              <GenerateLink keyword={report.keyword} primary />
            </div>
          </div>

          {report.warnings.length > 0 && (
            <ul className="space-y-1 rounded-md bg-subtle px-3 py-2 text-xs text-muted">
              {report.warnings.map((w, i) => (
                <li key={i}>ⓘ {w}</li>
              ))}
            </ul>
          )}

          {/* KPI 타일 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile
              label="네이버 월간 검색량"
              value={naver?.main ? compact(naver.main.monthlyTotal) : "-"}
              sub={
                naver?.main
                  ? `PC ${compact(naver.main.monthlyPc)} · 모바일 ${compact(naver.main.monthlyMobile)}`
                  : "데이터 없음"
              }
            />
            <StatTile
              label="구글 월평균 검색량"
              value={
                google?.main?.avgMonthlySearches != null
                  ? compact(google.main.avgMonthlySearches)
                  : "-"
              }
              sub="최근 12개월 평균"
            />
            <StatTile
              label="네이버 경쟁정도"
              value={naver?.main?.competition ?? "-"}
              sub="검색광고 기준"
            />
            <StatTile
              label="구글 경쟁도"
              value={
                google?.main?.competition
                  ? (GOOGLE_COMP[google.main.competition] ?? google.main.competition)
                  : "-"
              }
              sub={
                google?.main?.cpcLow != null && google?.main?.cpcHigh != null
                  ? `CPC ${Math.round(google.main.cpcLow).toLocaleString()}~${Math.round(google.main.cpcHigh).toLocaleString()}원`
                  : "CPC 정보 없음"
              }
            />
            <StatTile
              label="블로그 문서량"
              value={mainDoc != null ? compact(mainDoc) : "-"}
              sub={docCounts ? "네이버 블로그 누적" : "오픈API 키 필요"}
            />
            <StatTile
              label="콘텐츠 포화도"
              value={saturation != null ? saturation.toFixed(1) : "-"}
              sub="문서량÷검색량 · 낮을수록 기회"
            />
          </div>

          {/* 차트 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {naverBarData.length > 0 && (
              <ChartCard title="네이버 연관 키워드 월간 검색량 TOP 10">
                <div style={{ height: naverBarData.length * 34 + 70 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={naverBarData}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
                      barSize={16}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={C_GRID}
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        fontSize={11}
                        tickFormatter={compact}
                        stroke="#9aa5a0"
                      />
                      <YAxis
                        type="category"
                        dataKey="keyword"
                        width={110}
                        fontSize={11}
                        stroke="#9aa5a0"
                      />
                      <Tooltip
                        formatter={(v) => Number(v).toLocaleString()}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        dataKey="PC"
                        stackId="a"
                        fill={C_PC}
                        stroke="#ffffff"
                        strokeWidth={1}
                      />
                      <Bar
                        dataKey="모바일"
                        stackId="a"
                        fill={C_MOBILE}
                        stroke="#ffffff"
                        strokeWidth={1}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            )}

            {trendData.length > 1 && (
              <ChartCard title="구글 검색량 추이 (최근 12개월)">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={trendData}
                      margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
                      <XAxis dataKey="label" fontSize={11} stroke="#9aa5a0" />
                      <YAxis
                        fontSize={11}
                        tickFormatter={compact}
                        stroke="#9aa5a0"
                      />
                      <Tooltip
                        formatter={(v) => Number(v).toLocaleString()}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="검색량"
                        stroke={C_PC}
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: C_PC }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            )}
          </div>

          {/* 네이버 연관 키워드 테이블 */}
          {naver && naver.related.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink">
                네이버 연관 키워드 ({naver.related.length})
              </h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-subtle text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">키워드</th>
                      <th className="px-3 py-2 text-right">PC</th>
                      <th className="px-3 py-2 text-right">모바일</th>
                      <th className="px-3 py-2 text-right">합계</th>
                      <th className="px-3 py-2">경쟁</th>
                      <th className="px-3 py-2 text-right" title="네이버 블로그 누적 문서 수">
                        문서량
                      </th>
                      <th className="px-3 py-2 text-right" title="문서량÷검색량, 낮을수록 기회">
                        포화도
                      </th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {naver.related.map((r) => {
                      const doc = docCounts?.[r.keyword] ?? null;
                      const sat =
                        doc != null && r.monthlyTotal > 0
                          ? (doc / r.monthlyTotal).toFixed(1)
                          : null;
                      return (
                        <tr key={r.keyword} className="border-t border-border">
                          <td className="px-3 py-2 font-medium text-ink">
                            {r.keyword}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {fmt(r.monthlyPc)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {fmt(r.monthlyMobile)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">
                            {fmt(r.monthlyTotal)}
                          </td>
                          <td className="px-3 py-2 text-muted">{r.competition}</td>
                          <td className="px-3 py-2 text-right font-mono text-muted">
                            {doc != null ? fmt(doc) : "-"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted">
                            {sat ?? "-"}
                          </td>
                          <td className="px-3 py-2">
                            <RowActions
                              state={saveStates[r.keyword]}
                              onSave={() =>
                                save(r.keyword, r.monthlyTotal, r.competition, "naver_ads")
                              }
                              keyword={r.keyword}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 구글 연관 키워드 테이블 */}
          {google && google.related.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink">
                구글 연관 키워드 ({google.related.length})
              </h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-subtle text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">키워드</th>
                      <th className="px-3 py-2 text-right">월 검색량</th>
                      <th className="px-3 py-2">경쟁도</th>
                      <th className="px-3 py-2 text-right">CPC 저~고 (원)</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {google.related.map((r) => (
                      <tr key={r.keyword} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-ink">{r.keyword}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {fmt(r.avgMonthlySearches)}
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {r.competition
                            ? (GOOGLE_COMP[r.competition] ?? r.competition)
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-muted">
                          {r.cpcLow != null && r.cpcHigh != null
                            ? `${Math.round(r.cpcLow).toLocaleString()}~${Math.round(r.cpcHigh).toLocaleString()}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          <RowActions
                            state={saveStates[r.keyword]}
                            onSave={() =>
                              save(
                                r.keyword,
                                r.avgMonthlySearches,
                                r.competition,
                                "google_ads",
                              )
                            }
                            keyword={r.keyword}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

function SaveButton({
  state,
  onClick,
}: {
  state?: SaveState;
  onClick: () => void;
}) {
  const done = state === "saved" || state === "dup";
  return (
    <button
      onClick={onClick}
      disabled={!!state}
      className="rounded-md border border-accent-deep px-3 py-1.5 text-sm font-medium text-accent-deep hover:bg-tint disabled:opacity-60"
    >
      {state === "busy"
        ? "저장 중…"
        : state === "dup"
          ? "이미 보관함에 있음"
          : done
            ? "보관함에 저장됨"
            : "보관함에 저장"}
    </button>
  );
}

function GenerateLink({
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
          : "rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-subtle"
      }
    >
      콘텐츠 생성 →
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
    <div className="flex justify-end gap-1.5 whitespace-nowrap">
      <button
        onClick={onSave}
        disabled={!!state}
        className="rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-subtle disabled:opacity-60"
      >
        {state === "busy"
          ? "…"
          : state === "dup"
            ? "보관됨"
            : state === "saved"
              ? "저장됨"
              : "보관함"}
      </button>
      <GenerateLink keyword={keyword} />
    </div>
  );
}
