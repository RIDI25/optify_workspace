"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Lead, SeoDiagnosis } from "@/types/database";
import type { AuditCheck, DiagnosisResult } from "@/lib/seo-audit/types";

const input =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep";

const STATUS_UI: Record<AuditCheck["status"], { label: string; cls: string }> = {
  pass: { label: "양호", cls: "bg-tint text-accent-deep" },
  warn: { label: "개선", cls: "bg-amber-50 text-amber-700" },
  fail: { label: "문제", cls: "bg-red-50 text-red-600" },
  info: { label: "참고", cls: "bg-subtle text-muted" },
  skip: { label: "생략", cls: "bg-subtle text-muted" },
};

function scoreColor(score: number | null): string {
  if (score == null) return "text-muted";
  if (score < 50) return "text-red-600";
  if (score < 80) return "text-amber-700";
  return "text-accent-deep";
}

export function DiagnosisView() {
  const [url, setUrl] = useState("");
  const [csvName, setCsvName] = useState("");
  const csvTextRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState("");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [current, setCurrent] = useState<{ id: string; result: DiagnosisResult; aiSummary: string | null } | null>(null);
  const [history, setHistory] = useState<SeoDiagnosis[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setLeads((data ?? []) as Lead[]));
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("seo_diagnoses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setHistory((data ?? []) as SeoDiagnosis[]));
  }, [refreshKey]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCsvName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      csvTextRef.current = String(reader.result ?? "");
    };
    reader.readAsText(f, "utf-8");
  }

  async function run() {
    if (!url.trim()) {
      setMsg("URL을 입력하세요.");
      return;
    }
    setRunning(true);
    setMsg("진단 중… 속도 측정(PageSpeed) 포함 시 최대 1분 걸립니다.");
    setCurrent(null);
    try {
      const res = await fetch("/api/diagnosis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          csvText: csvTextRef.current,
          leadId: leadId || null,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setCurrent({ id: d.id, result: d.result, aiSummary: null });
        setMsg("");
        setRefreshKey((k) => k + 1);
      } else {
        setMsg(`실패: ${d.error ?? "알 수 없음"}`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "진단 실패");
    } finally {
      setRunning(false);
    }
  }

  async function generateSummary() {
    if (!current) return;
    setBusy("summary");
    setMsg("");
    try {
      const res = await fetch("/api/diagnosis/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosisId: current.id }),
      });
      const d = await res.json();
      if (d.ok) setCurrent({ ...current, aiSummary: d.summary });
      else setMsg(`소견 생성 실패: ${d.error ?? "알 수 없음"}`);
    } finally {
      setBusy("");
    }
  }

  async function exportPdf(id: string) {
    setBusy(`pdf:${id}`);
    setMsg("");
    try {
      const res = await fetch("/api/diagnosis/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosisId: id }),
      });
      const d = await res.json();
      if (d.ok && d.url) window.open(d.url, "_blank");
      else setMsg(`리포트 실패: ${d.error ?? "알 수 없음"}`);
    } finally {
      setBusy("");
    }
  }

  function openHistory(row: SeoDiagnosis) {
    setCurrent({
      id: row.id,
      result: row.results as unknown as DiagnosisResult,
      aiSummary: row.ai_summary,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeDiagnosis(row: SeoDiagnosis) {
    if (!window.confirm(`${row.url} 진단 기록을 삭제할까요?`)) return;
    const supabase = createClient();
    await supabase.from("seo_diagnoses").delete().eq("id", row.id);
    if (current?.id === row.id) setCurrent(null);
    setRefreshKey((k) => k + 1);
  }

  const result = current?.result;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">SEO 진단</h1>
        <p className="mt-1 text-sm text-muted">
          URL 실시간 진단 + 스크리밍프로그 크롤 교차 검증 → 점수·리포트·개선 견적 (owner 전용)
        </p>
      </div>

      {/* 입력 */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-ink">
              사이트 URL <span className="text-accent-deep">*</span>
            </span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="예: kims-hearing.com"
              className={`w-full ${input}`}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-ink">리드 연결 (선택)</span>
            <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={`w-full ${input}`}>
              <option value="">연결 안 함</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.company_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md border border-accent-deep px-3 py-1.5 text-sm font-medium text-accent-deep hover:bg-tint">
            스크리밍프로그 CSV 첨부 (선택)
            <input ref={fileRef} type="file" accept=".csv" onChange={onFile} className="hidden" />
          </label>
          {csvName && (
            <span className="text-xs text-muted">
              {csvName}{" "}
              <button
                onClick={() => {
                  csvTextRef.current = null;
                  setCsvName("");
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-red-500 hover:underline"
              >
                제거
              </button>
            </span>
          )}
          <span className="text-xs text-muted">
            Internal 탭 전체 내보내기(CSV). 없으면 홈 페이지 기준 라이트 진단.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={run}
            disabled={running}
            className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
          >
            {running ? "진단 중…" : "진단 실행"}
          </button>
          {msg && <span className="text-xs text-muted">{msg}</span>}
        </div>
      </section>

      {/* 결과 */}
      {result && (
        <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-ink">{result.pageTitle ?? result.finalUrl}</h2>
              <p className="text-xs text-muted">
                {result.finalUrl} · {result.fetchedAt.slice(0, 10)}
                {result.siteWide ? " · 크롤 교차 검증 포함" : " · 라이트 진단"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={generateSummary}
                disabled={!!busy}
                className="rounded-md border border-accent-deep px-3 py-1.5 text-sm font-medium text-accent-deep hover:bg-tint disabled:opacity-50"
              >
                {busy === "summary" ? "생성 중…" : current?.aiSummary ? "AI 소견 재생성" : "AI 소견 생성"}
              </button>
              <button
                onClick={() => exportPdf(current!.id)}
                disabled={!!busy}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-subtle disabled:opacity-50"
              >
                {busy === `pdf:${current!.id}` ? "생성 중…" : "PDF 리포트"}
              </button>
              {result.suggestedItems.length > 0 && (
                <Link
                  href={`/quotes?diagnosisId=${current!.id}`}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-bold text-ink hover:opacity-90"
                >
                  개선 견적 만들기 ({result.suggestedItems.length})
                </Link>
              )}
            </div>
          </div>

          {/* 점수 카드 */}
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            <div className="rounded-md bg-tint p-3 text-center">
              <p className={`text-2xl font-bold ${scoreColor(result.totalScore)}`}>{result.totalScore}</p>
              <p className="mt-0.5 text-[11px] text-muted">종합</p>
            </div>
            {result.categories.map((cat) => (
              <div key={cat.key} className="rounded-md border border-border p-3 text-center">
                <p className={`text-xl font-bold ${scoreColor(cat.score)}`}>{cat.score ?? "-"}</p>
                <p className="mt-0.5 text-[11px] text-muted">{cat.label}</p>
              </div>
            ))}
          </div>

          {current?.aiSummary && (
            <div className="whitespace-pre-wrap rounded-md bg-tint/60 p-4 text-sm leading-relaxed text-ink">
              {current.aiSummary}
            </div>
          )}

          {/* 체크 상세 */}
          {result.categories.map((cat) => (
            <div key={cat.key}>
              <h3 className="mb-2 text-sm font-bold text-accent-deep">
                {cat.label} {cat.score != null && <span className="font-normal text-muted">— {cat.score}점</span>}
              </h3>
              <ul className="space-y-1.5">
                {cat.checks.map((check) => (
                  <li key={check.key} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-0.5 inline-block w-11 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-bold ${STATUS_UI[check.status].cls}`}
                    >
                      {STATUS_UI[check.status].label}
                    </span>
                    <span className="w-36 shrink-0 font-medium text-ink">{check.label}</span>
                    <span className="min-w-0 text-muted">{check.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* 교차 검증 */}
          {result.crossChecks.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-sm font-bold text-amber-700">
                교차 검증 불일치 {result.crossChecks.length}건 (크롤 vs 현재)
              </p>
              <ul className="space-y-1 text-xs text-ink">
                {result.crossChecks.map((f, i) => (
                  <li key={i}>
                    <b>{f.field}</b>: 크롤 &quot;{f.crawler.slice(0, 60)}&quot; → 현재 &quot;{f.live.slice(0, 60)}&quot;
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted">{result.crossChecks[0].note}</p>
            </div>
          )}
        </section>
      )}

      {/* 내역 */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-base font-bold text-ink">진단 내역</h2>
        {history.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted">
            진단 기록이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">URL</th>
                  <th className="py-2 pr-3 font-medium">진단일</th>
                  <th className="py-2 pr-3 text-center font-medium">점수</th>
                  <th className="py-2 pr-3 font-medium">크롤</th>
                  <th className="py-2 font-medium">액션</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-border">
                    <td className="max-w-60 truncate py-2 pr-3 font-medium text-ink">{row.url}</td>
                    <td className="py-2 pr-3 text-muted">{row.created_at.slice(0, 10)}</td>
                    <td className={`py-2 pr-3 text-center font-mono font-bold ${scoreColor(row.total_score)}`}>
                      {row.total_score ?? "-"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted">{row.has_csv ? "교차" : "라이트"}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openHistory(row)}
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-subtle"
                        >
                          열기
                        </button>
                        <button
                          onClick={() => exportPdf(row.id)}
                          disabled={!!busy}
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-subtle disabled:opacity-50"
                        >
                          {busy === `pdf:${row.id}` ? "생성 중…" : "PDF"}
                        </button>
                        <button
                          onClick={() => removeDiagnosis(row)}
                          className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-red-500"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
