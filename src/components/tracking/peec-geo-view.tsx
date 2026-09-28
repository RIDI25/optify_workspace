"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useClientContext } from "@/components/providers/client-context";
import type { PeecSummary } from "@/lib/peec";

const PERIODS = [7, 14, 30] as const;
const pct = (v: number | null | undefined) => (v == null ? "-" : `${Math.round(v * 100)}%`);
const LABEL: Record<string, string> = { "ChatGPT UI": "ChatGPT", "Google AI Overview": "구글 AI 개요", "Google AI Mode": "구글 AI 모드", "Naver AI Briefing": "네이버 AI 브리핑" };
const cname = (n: string) => LABEL[n] ?? n;

function cellCls(v: number | null | undefined): string {
  if (v == null) return "text-muted";
  if (v >= 0.67) return "bg-emerald-50 text-emerald-700 font-semibold";
  if (v > 0) return "bg-blue-50 text-blue-700";
  return "bg-red-50 text-red-600";
}

/**
 * GEO 탭 — Peec AI 결과 (2026-09-28). ChatGPT·구글 AI 개요·네이버 AI 브리핑 등 Peec 가 매일 재는 값을
 * /api/peec/summary 로 가져와 노출률·채널별·질문별·출처를 보여 준다. 맥의 직접 측정은 껐다.
 */
export function PeecGeoView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ key: string; summary: PeecSummary | null; error: string | null; cached?: boolean } | null>(null);
  const key = `${selectedClientId}|${days}|${tick}`;

  useEffect(() => {
    if (!selectedClientId) return;
    let alive = true;
    fetch(`/api/peec/summary?clientId=${selectedClientId}&days=${days}${tick ? "&refresh=1" : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setState({ key, summary: d.ok ? d.summary : null, error: d.ok ? null : d.error ?? "조회 실패", cached: d.cached });
      })
      .catch((e) => alive && setState({ key, summary: null, error: e instanceof Error ? e.message : "조회 실패" }));
    return () => {
      alive = false;
    };
  }, [selectedClientId, days, tick, key]);

  const cur = state?.key === key ? state : null;
  const s = cur?.summary ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">
            <span className="mr-2 rounded-md bg-tint px-2 py-0.5 text-sm font-bold text-accent-deep">GEO</span>
            AI 노출 — Peec AI
          </h1>
          <p className="mt-1 text-sm text-muted">{selectedClient?.name} · ChatGPT·구글 AI 개요·네이버 AI 브리핑에 매일 같은 질문을 던져 우리 브랜드가 답변에 나오는지 잽니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-subtle p-0.5">
            {PERIODS.map((d) => (
              <button key={d} onClick={() => setDays(d)} className={["rounded px-3 py-1 text-sm", d === days ? "bg-surface font-semibold text-accent-deep shadow-sm" : "text-muted hover:text-ink"].join(" ")}>
                최근 {d}일
              </button>
            ))}
          </div>
          <button onClick={() => setTick((n) => n + 1)} className="rounded-md border border-border px-3 py-1.5 text-sm text-ink hover:bg-subtle">
            새로고침
          </button>
        </div>
      </div>

      {!cur ? (
        <p className="text-sm text-muted">Peec 에서 불러오는 중…</p>
      ) : cur.error ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{cur.error}</p>
      ) : s ? (
        <>
          <p className="text-xs text-muted">
            {s.period.start} ~ {s.period.end} · AI 답변 {s.chatCount ?? "-"}건 · 질문 {s.prompts.length}개 · Peec 프로젝트 “{s.project.name}”
          </p>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "노출률", value: pct(s.total.visibility), sub: `답변 ${s.total.answers}건 중 ${s.total.visible}건에 우리 브랜드` },
              { label: "언급", value: `${s.total.mentions}회`, sub: "답변 본문에 이름이 나온 횟수" },
              { label: "평균 순위", value: s.total.position == null ? "-" : `${s.total.position.toFixed(1)}위`, sub: "답변 안에서 몇 번째로 나왔나" },
              { label: "우리 사이트 인용", value: s.ownDomainRank ? `${s.ownDomainRank}위` : "없음", sub: `인용 출처 ${s.domainsTotal}곳 중` },
            ].map((k) => (
              <div key={k.label} className="rounded-lg bg-tint px-4 py-3">
                <p className="text-xs text-muted">{k.label}</p>
                <p className="mt-0.5 text-2xl font-bold text-ink">{k.value}</p>
                <p className="text-[11px] text-muted">{k.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">채널별 노출률</h2>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.channels.map((c) => ({ name: cname(c.name), 노출률: Math.round((c.visibility ?? 0) * 100) }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Bar dataKey="노출률" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="mt-2 w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr><th className="py-1 text-left font-medium">채널</th><th className="text-right font-medium">노출/답변</th><th className="text-right font-medium">언급</th><th className="text-right font-medium">평균 순위</th></tr>
                </thead>
                <tbody>
                  {s.channels.map((c) => (
                    <tr key={c.channel} className="border-t border-border">
                      <td className="py-1.5">{cname(c.name)}</td>
                      <td className="text-right tabular-nums">{c.visible}/{c.answers} <span className="text-muted">({pct(c.visibility)})</span></td>
                      <td className="text-right tabular-nums">{c.mentions}</td>
                      <td className="text-right tabular-nums">{c.position == null ? "-" : c.position.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">일별 노출률</h2>
              {s.trend.length < 2 ? (
                <p className="text-sm text-muted">측정이 이틀 이상 쌓이면 추이가 보입니다.</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={s.trend.map((t) => ({ date: t.date.slice(5).replace("-", "/"), 노출률: Math.round((t.visibility ?? 0) * 100) }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Line dataKey="노출률" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <h3 className="mb-1 mt-3 text-xs font-semibold text-muted">언급 점유율</h3>
              {s.shareOfVoice.length <= 1 ? (
                <p className="text-xs text-muted">Peec 에 경쟁 브랜드가 없어 점유율을 계산하지 않습니다. Peec 프로젝트에 경쟁사를 넣으면 여기 비교가 나옵니다.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {s.shareOfVoice.slice(0, 6).map((b) => (
                    <li key={b.brand} className="flex items-center gap-2">
                      <span className={["w-28 truncate", b.own ? "font-semibold text-accent-deep" : "text-ink"].join(" ")}>{b.brand}</span>
                      <span className="h-2 flex-1 rounded bg-subtle"><span className={["block h-2 rounded", b.own ? "bg-accent" : "bg-gray-400"].join(" ")} style={{ width: `${Math.round((b.share ?? 0) * 100)}%` }} /></span>
                      <span className="w-10 text-right text-xs tabular-nums text-muted">{pct(b.share)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-1 text-sm font-semibold text-ink">질문별 노출률</h2>
            <p className="mb-2 text-xs text-muted">초록 = 3번 중 2번 이상 나옴 · 파랑 = 가끔 나옴 · 빨강 = 한 번도 안 나옴</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1 text-left font-medium">질문</th>
                    {s.channels.map((c) => (
                      <th key={c.channel} className="w-28 text-center font-medium">{cname(c.name)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.prompts.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-1.5 pr-2">
                        <span className="text-ink">{p.text}</span>
                        {p.topic && <span className="ml-1.5 text-[11px] text-muted">{p.topic}</span>}
                      </td>
                      {s.channels.map((c) => (
                        <td key={c.channel} className={["text-center tabular-nums", cellCls(p.cells[c.channel])].join(" ")}>{pct(p.cells[c.channel])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold text-ink">AI 가 많이 인용한 출처</h2>
            <ol className="grid gap-x-6 gap-y-1 text-sm md:grid-cols-3">
              {s.topDomains.map((d, i) => (
                <li key={d.domain} className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs text-muted">{i + 1}</span>
                  <span className={d.own ? "font-semibold text-accent-deep" : "text-ink"}>{d.domain}{d.own ? " (우리)" : ""}</span>
                  <span className="ml-auto text-xs tabular-nums text-muted">{d.citations}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}
    </div>
  );
}
