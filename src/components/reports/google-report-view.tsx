"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { saveReport } from "@/lib/actions/reports";
import { addTopicToPlan, saveKeywordFromGsc } from "@/lib/actions/keywords";
import { channelLabel } from "@/lib/channels";
import { classifyOpportunities, type GscQueryRow } from "@/lib/gsc-opportunities";
import { GoogleAnalyticsPanel, type Ga4Data, type GscData } from "@/components/reports/google-analytics-panel";
import type { ChannelSettings } from "@/types/database";

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  return { start: `${ym}-01`, end: `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
}
const num = (v: number | undefined | null) => Math.round(v ?? 0).toLocaleString("ko-KR");

type SavedRow = { year_month: string; gsc_snapshot: GscData | null; ga4_snapshot: Ga4Data | null };

/**
 * 서치콘솔 · GA4 — 구글 서치콘솔과 애널리틱스 결과를 불러와 보기 쉽게 정리하는 화면.
 * (2026-09-06: 네이버 입력·스크린샷 분석·AI 소견·PDF 내보내기는 뺐다. 불러온 달은 자동 저장돼 월별 추이가 쌓인다.)
 */
export function GoogleReportView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [ym, setYm] = useState(currentYm());
  const [pStart, setPStart] = useState(() => `${currentYm()}-01`);
  const [pEnd, setPEnd] = useState(() => ymdLocal(new Date()));
  const [data, setData] = useState<{ key: string; gsc: GscData | null; ga4: Ga4Data | null; savedAt: string | null } | null>(null);
  const [history, setHistory] = useState<{ clientId: string; rows: SavedRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [channels, setChannels] = useState<{ clientId: string; rows: ChannelSettings[] }>({ clientId: "", rows: [] });
  const [oppChannel, setOppChannel] = useState("");
  const [savedKw, setSavedKw] = useState<Set<string>>(new Set());
  const [addedPlan, setAddedPlan] = useState<Set<string>>(new Set());

  const key = `${selectedClientId}|${ym}`;

  // 저장된 스냅샷(이 달) + 월별 이력 + 채널
  useEffect(() => {
    if (!selectedClientId) return;
    let active = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("reports").select("year_month, gsc_snapshot, ga4_snapshot, created_at").eq("client_id", selectedClientId).order("year_month"),
      supabase.from("channel_settings").select("id, channel").eq("client_id", selectedClientId).eq("is_active", true),
    ]).then(([r, c]) => {
      if (!active) return;
      const rows = (r.data ?? []) as (SavedRow & { created_at: string })[];
      setHistory({ clientId: selectedClientId, rows });
      const mine = rows.find((x) => x.year_month === ym);
      setData({ key: `${selectedClientId}|${ym}`, gsc: mine?.gsc_snapshot ?? null, ga4: mine?.ga4_snapshot ?? null, savedAt: mine ? "저장된 자료" : null });
      setChannels({ clientId: selectedClientId, rows: (c.data ?? []) as ChannelSettings[] });
    });
    return () => {
      active = false;
    };
  }, [selectedClientId, ym]);

  function changeYm(next: string) {
    setYm(next);
    if (!/^\d{4}-\d{2}$/.test(next)) return;
    const { start, end } = monthRange(next);
    const today = ymdLocal(new Date());
    setPStart(start);
    setPEnd(end > today ? today : end);
  }

  async function fetchAnalytics() {
    if (!selectedClientId) return;
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/reports/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClientId, yearMonth: ym, startDate: pStart, endDate: pEnd }),
      });
      const d = await res.json();
      if (!d.ok) {
        setMsg(d.error ?? "조회 실패");
        return;
      }
      const gsc = (d.gsc ?? null) as GscData | null;
      const ga4 = (d.ga4 ?? null) as Ga4Data | null;
      setData({ key, gsc, ga4, savedAt: "방금 불러옴" });
      const errs = [d.gscError, d.ga4Error].filter(Boolean);
      // 불러온 자료는 이 달 스냅샷으로 자동 저장 → 월별 추이
      const saved = await saveReport(selectedClientId, ym, {
        gsc_snapshot: gsc as Record<string, unknown> | null,
        ga4_snapshot: ga4 as Record<string, unknown> | null,
      });
      setHistory((h) =>
        h && h.clientId === selectedClientId
          ? { clientId: h.clientId, rows: [...h.rows.filter((r) => r.year_month !== ym), { year_month: ym, gsc_snapshot: gsc, ga4_snapshot: ga4 }].sort((a, b) => a.year_month.localeCompare(b.year_month)) }
          : h,
      );
      setMsg(
        (errs.length ? errs.join(" · ") + " · " : "") +
          `${d.period?.startDate ?? pStart} ~ ${d.period?.endDate ?? pEnd} 불러오기 완료` +
          (saved.ok ? " · 저장됨" : ` · 저장 실패: ${saved.error}`),
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  const chRows = channels.clientId === selectedClientId ? channels.rows : [];
  const oppCh = oppChannel || chRows[0]?.channel || "";
  async function saveKw(query: string) {
    if (!selectedClientId) return;
    const r = await saveKeywordFromGsc(selectedClientId, query);
    if (r.ok) setSavedKw((prev) => new Set(prev).add(query));
  }
  async function addPlan(query: string) {
    if (!selectedClientId || !oppCh) return;
    const r = await addTopicToPlan({ clientId: selectedClientId, channel: oppCh, title: query });
    if (r.ok) setAddedPlan((prev) => new Set(prev).add(query));
  }

  if (!selectedClientId) return <p className="text-sm text-muted">왼쪽 메뉴에서 고객사를 선택하세요.</p>;
  const cur = data?.key === key ? data : null;
  const g = cur?.gsc ?? null;
  const a = cur?.ga4 ?? null;
  const hasData = !!(g || a);
  const opportunities = g?.topQueries ? classifyOpportunities(g.topQueries as GscQueryRow[]) : null;
  const hist = history?.clientId === selectedClientId ? history.rows : [];
  const trend = hist
    .filter((r) => r.gsc_snapshot || r.ga4_snapshot)
    .map((r) => ({
      month: r.year_month.slice(2).replace("-", "/"),
      클릭: r.gsc_snapshot?.clicks ?? 0,
      노출: r.gsc_snapshot?.impressions ?? 0,
      세션: r.ga4_snapshot?.sessions ?? 0,
    }));
  const connected = !!(selectedClient?.gsc_site_url || selectedClient?.ga4_property_id);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">서치콘솔 · GA4</h1>
          <p className="mt-1 text-sm text-muted">{selectedClient?.name} · 구글 서치콘솔과 애널리틱스 결과를 불러와 정리합니다. 불러온 달은 자동으로 저장돼 월별 추이가 쌓입니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={ym} onChange={(e) => changeYm(e.target.value)} className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm" aria-label="월" />
          <input type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm" aria-label="시작일" />
          <span className="text-xs text-muted">~</span>
          <input type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm" aria-label="종료일" />
          <button
            onClick={fetchAnalytics}
            disabled={loading || !connected}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "불러오는 중…" : "구글 자료 불러오기"}
          </button>
        </div>
      </div>

      {!connected && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          이 고객사에 서치콘솔 사이트 URL 이나 GA4 속성 ID 가 없습니다. 기본정보 탭에서 입력하면 불러올 수 있습니다.
        </p>
      )}
      {msg && <p className="text-xs text-muted">{msg}</p>}
      {cur?.savedAt && hasData && <p className="text-xs text-muted">{cur.savedAt} · {ym}</p>}

      {hasData && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="클릭 (GSC)" value={num(g?.clicks)} />
          <Kpi label="노출 (GSC)" value={num(g?.impressions)} />
          <Kpi label="CTR" value={`${((g?.ctr ?? 0) * 100).toFixed(1)}%`} />
          <Kpi label="평균 순위" value={(g?.position ?? 0).toFixed(1)} />
          <Kpi label="세션 (GA4)" value={num(a?.sessions)} />
          <Kpi label="사용자" value={num(a?.totalUsers)} />
          <Kpi label="페이지뷰" value={num(a?.screenPageViews)} />
          <Kpi label="평균 체류" value={`${num(a?.averageSessionDuration)}초`} />
        </div>
      )}

      <GoogleAnalyticsPanel gsc={g} ga4={a} />

      {opportunities && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">기회 키워드 (서치콘솔 상위 검색어에서)</h2>
            {chRows.length > 0 && (
              <label className="flex items-center gap-1 text-xs text-muted">
                플랜 채널
                <select value={oppCh} onChange={(e) => setOppChannel(e.target.value)} className="rounded-md border border-border bg-surface px-2 py-1 text-xs">
                  {chRows.map((c) => (
                    <option key={c.id} value={c.channel}>
                      {channelLabel(c.channel)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <OppList title="노출은 많은데 클릭이 적은 검색어 (제목·설명 손보기)" rows={opportunities.lowCtr} savedKw={savedKw} addedPlan={addedPlan} onSave={saveKw} onAdd={addPlan} canAdd={!!oppCh} />
            <OppList title="11~20위 검색어 (한 번 더 밀면 1페이지)" rows={opportunities.secondPage} savedKw={savedKw} addedPlan={addedPlan} onSave={saveKw} onAdd={addPlan} canAdd={!!oppCh} />
          </div>
        </section>
      )}

      {trend.length > 1 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">월별 추이 (저장된 달)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line yAxisId="l" type="monotone" dataKey="클릭" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="r" type="monotone" dataKey="노출" stroke="#93c5fd" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="l" type="monotone" dataKey="세션" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-muted">저장된 달 {trend.length}개. 달마다 한 번 불러오면 이 그래프가 쌓입니다.</p>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

function OppList({
  title,
  rows,
  savedKw,
  addedPlan,
  onSave,
  onAdd,
  canAdd,
}: {
  title: string;
  rows: GscQueryRow[];
  savedKw: Set<string>;
  addedPlan: Set<string>;
  onSave: (q: string) => void;
  onAdd: (q: string) => void;
  canAdd: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">해당 없음</p>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 8).map((r) => (
            <li key={r.query} className="flex items-center justify-between gap-2 rounded-md bg-subtle px-2.5 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-ink">{r.query}</span>
                <span className="ml-2 text-muted">
                  노출 {Math.round(r.impressions).toLocaleString()} · CTR {(r.ctr * 100).toFixed(1)}% · {r.position.toFixed(1)}위
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                <button onClick={() => onSave(r.query)} disabled={savedKw.has(r.query)} className="rounded border border-border bg-surface px-2 py-0.5 hover:bg-tint disabled:opacity-50">
                  {savedKw.has(r.query) ? "저장됨" : "키워드 저장"}
                </button>
                {canAdd && (
                  <button onClick={() => onAdd(r.query)} disabled={addedPlan.has(r.query)} className="rounded border border-accent-deep bg-surface px-2 py-0.5 text-accent-deep hover:bg-tint disabled:opacity-50">
                    {addedPlan.has(r.query) ? "추가됨" : "플랜에 추가"}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
