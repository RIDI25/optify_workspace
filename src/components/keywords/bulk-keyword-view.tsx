"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { useClientContext } from "@/components/providers/client-context";
import { saveKeywordToPool } from "@/lib/actions/keywords";
import { BULK_MAX, type BulkKeywordRow } from "@/lib/keyword-bulk";

const num = (v: number | null | undefined) =>
  v == null ? "-" : Math.round(v).toLocaleString("ko-KR");

/** 포화도 = 블로그 문서량 ÷ 네이버 월 검색량 — 낮을수록 진입 여지 큼 */
function saturation(row: BulkKeywordRow): number | null {
  if (row.blogDocs == null || !row.naver?.monthlyTotal) return null;
  return Math.round((row.blogDocs / row.naver.monthlyTotal) * 10) / 10;
}

export function BulkKeywordView() {
  const { selectedClientId } = useClientContext();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BulkKeywordRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const keywords = useMemo(
    () =>
      [
        ...new Set(
          text
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ],
    [text],
  );

  async function run() {
    if (!keywords.length) {
      setMsg("키워드를 입력하세요.");
      return;
    }
    if (keywords.length > BULK_MAX) {
      setMsg(`최대 ${BULK_MAX}개까지 조회할 수 있습니다. (현재 ${keywords.length}개)`);
      return;
    }
    setBusy(true);
    setMsg("");
    setRows([]);
    setWarnings([]);
    setSaved(new Set());
    try {
      const res = await fetch("/api/keywords/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, clientId: selectedClientId }),
      });
      const d = await res.json();
      if (d.ok) {
        setRows(d.rows as BulkKeywordRow[]);
        setWarnings((d.warnings ?? []) as string[]);
      } else {
        setMsg(`실패: ${d.error ?? "알 수 없음"}`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setBusy(false);
    }
  }

  async function save(row: BulkKeywordRow) {
    if (!selectedClientId) return;
    const r = await saveKeywordToPool({
      clientId: selectedClientId,
      keyword: row.keyword,
      avgMonthlySearches: row.naver?.monthlyTotal ?? row.google?.avgMonthlySearches ?? null,
      competition: row.naver?.competition ?? row.google?.competition ?? null,
      source: row.naver ? "naver_ads" : "google_ads",
    });
    if (r.ok) setSaved((prev) => new Set(prev).add(row.keyword));
  }

  function downloadCsv() {
    const header = [
      "키워드",
      "구글 월검색량",
      "구글 경쟁도",
      "CPC최저",
      "CPC최고",
      "네이버 PC",
      "네이버 모바일",
      "네이버 합계",
      "네이버 경쟁",
      "평균 광고수",
      "블로그 문서량",
      "포화도(문서/검색)",
    ];
    const lines = rows.map((row) =>
      [
        row.keyword,
        row.google?.avgMonthlySearches ?? "",
        row.google?.competition ?? "",
        row.google?.cpcLow != null ? Math.round(row.google.cpcLow) : "",
        row.google?.cpcHigh != null ? Math.round(row.google.cpcHigh) : "",
        row.naver?.monthlyPc ?? "",
        row.naver?.monthlyMobile ?? "",
        row.naver?.monthlyTotal ?? "",
        row.naver?.competition ?? "",
        row.naver?.avgAdDepth ?? "",
        row.blogDocs ?? "",
        saturation(row) ?? "",
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(","),
    );
    const csv = "﻿" + [header.join(","), ...lines].join("\n"); // BOM — 엑셀 한글 호환
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `keyword-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const chartData = rows.map((row) => ({
    keyword: row.keyword.length > 8 ? `${row.keyword.slice(0, 8)}…` : row.keyword,
    구글: row.google?.avgMonthlySearches ?? 0,
    네이버: row.naver?.monthlyTotal ?? 0,
  }));

  const totalNaver = rows.reduce((s, row) => s + (row.naver?.monthlyTotal ?? 0), 0);
  const totalGoogle = rows.reduce((s, row) => s + (row.google?.avgMonthlySearches ?? 0), 0);
  const top = rows.reduce<BulkKeywordRow | null>(
    (best, row) =>
      (row.naver?.monthlyTotal ?? 0) > (best?.naver?.monthlyTotal ?? -1) ? row : best,
    null,
  );

  return (
    <div className="space-y-4">
      {/* 입력 */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 space-y-1.5">
            <span className="text-sm font-medium text-ink">
              키워드 목록{" "}
              <span className={keywords.length > BULK_MAX ? "text-red-500" : "text-muted"}>
                ({keywords.length}/{BULK_MAX})
              </span>
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={"줄바꿈 또는 쉼표로 구분해 입력\n예)\nSEO 홈페이지 제작\n병원 마케팅\n네이버 플레이스 관리"}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
            />
          </label>
          <div className="space-y-2">
            <button
              onClick={run}
              disabled={busy || keywords.length === 0 || keywords.length > BULK_MAX}
              className="block rounded-md bg-accent px-4 py-2 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "조회 중…" : "지표 조회"}
            </button>
            {rows.length > 0 && (
              <button
                onClick={downloadCsv}
                className="block rounded-md border border-border px-4 py-2 text-sm hover:bg-subtle"
              >
                CSV 다운로드
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted">
          입력한 키워드의 지표만 조회합니다 (연관검색어 확장 없음). 구글·네이버 검색량 + 블로그
          문서량 기반 포화도까지 한 번에.
        </p>
        {msg && <p className="text-xs text-red-500">{msg}</p>}
        {warnings.map((w, i) => (
          <p key={i} className="text-xs text-amber-700">
            일부 소스 실패 — {w}
          </p>
        ))}
      </section>

      {rows.length > 0 && (
        <>
          {/* 요약 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-surface p-3 text-center">
              <p className="text-lg font-bold text-accent-deep">{num(totalNaver)}</p>
              <p className="text-[11px] text-muted">네이버 월 검색 합계</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3 text-center">
              <p className="text-lg font-bold text-ink">{num(totalGoogle)}</p>
              <p className="text-[11px] text-muted">구글 월 검색 합계</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3 text-center">
              <p className="truncate text-lg font-bold text-ink">{top?.keyword ?? "-"}</p>
              <p className="text-[11px] text-muted">최다 검색 키워드</p>
            </div>
          </div>

          {/* 비교 차트 */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">키워드별 월 검색량 비교</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e9e7" />
                  <XAxis dataKey="keyword" fontSize={11} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v) => Number(v).toLocaleString("ko-KR")} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="네이버" fill="#057A4E" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="구글" fill="#2a78d6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* 리포트 테이블 */}
          <section className="overflow-x-auto rounded-lg border border-border bg-surface p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">키워드</th>
                  <th className="py-2 pr-3 text-right font-medium">구글 월검색</th>
                  <th className="py-2 pr-3 font-medium">구글 경쟁</th>
                  <th className="py-2 pr-3 text-right font-medium">CPC(원)</th>
                  <th className="py-2 pr-3 text-right font-medium">네이버 PC</th>
                  <th className="py-2 pr-3 text-right font-medium">모바일</th>
                  <th className="py-2 pr-3 text-right font-medium">네이버 합계</th>
                  <th className="py-2 pr-3 font-medium">네이버 경쟁</th>
                  <th className="py-2 pr-3 text-right font-medium">문서량</th>
                  <th className="py-2 pr-3 text-right font-medium" title="블로그 문서량 ÷ 네이버 월 검색량 — 낮을수록 진입 여지">
                    포화도
                  </th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const sat = saturation(row);
                  return (
                    <tr key={row.keyword} className="border-b border-border">
                      <td className="py-2 pr-3 font-medium text-ink">{row.keyword}</td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {num(row.google?.avgMonthlySearches)}
                      </td>
                      <td className="py-2 pr-3 text-muted">{row.google?.competition ?? "-"}</td>
                      <td className="py-2 pr-3 text-right font-mono text-muted">
                        {row.google?.cpcLow != null && row.google?.cpcHigh != null
                          ? `${num(row.google.cpcLow)}~${num(row.google.cpcHigh)}`
                          : "-"}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{num(row.naver?.monthlyPc)}</td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {num(row.naver?.monthlyMobile)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono font-bold text-accent-deep">
                        {num(row.naver?.monthlyTotal)}
                      </td>
                      <td className="py-2 pr-3 text-muted">{row.naver?.competition ?? "-"}</td>
                      <td className="py-2 pr-3 text-right font-mono">{num(row.blogDocs)}</td>
                      <td
                        className={[
                          "py-2 pr-3 text-right font-mono",
                          sat == null ? "text-muted" : sat < 5 ? "text-accent-deep" : sat > 20 ? "text-red-500" : "text-ink",
                        ].join(" ")}
                      >
                        {sat ?? "-"}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => save(row)}
                          disabled={saved.has(row.keyword)}
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-subtle disabled:opacity-50"
                        >
                          {saved.has(row.keyword) ? "보관됨" : "☆ 보관"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted">
              포화도 = 블로그 문서량 ÷ 네이버 월 검색량. 낮을수록(초록) 콘텐츠 진입 여지가 크고,
              20 이상(빨강)은 검색량 대비 글이 이미 많은 키워드입니다.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
