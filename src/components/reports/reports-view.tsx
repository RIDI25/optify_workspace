"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { channelLabel } from "@/lib/channels";
import { saveReport } from "@/lib/actions/reports";
import {
  NaverMetricsForm,
  defaultNaverMetrics,
} from "@/components/reports/naver-metrics-form";
import { ReportExport } from "@/components/reports/report-export";
import type { NaverManualMetrics } from "@/types/database";

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const end = new Date(y, m, 0).getDate();
  return { start: `${ym}-01`, end: `${ym}-${String(end).padStart(2, "0")}` };
}
function nextYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1); // m is 1-based → Date month index m = 다음 달
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface ContentSummary {
  total: number;
  published: number;
  byChannel: Record<string, number>;
}
interface PlanRow {
  title: string;
  channel: string;
  scheduled_date: string | null;
}

export function ReportsView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [ym, setYm] = useState(currentYm());

  const [gsc, setGsc] = useState<Record<string, unknown> | null>(null);
  const [ga4, setGa4] = useState<Record<string, unknown> | null>(null);
  const [analyticsMsg, setAnalyticsMsg] = useState("");
  const [naver, setNaver] = useState<NaverManualMetrics>(defaultNaverMetrics());
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<"draft" | "final">("draft");

  const [contentSummary, setContentSummary] = useState<ContentSummary>({
    total: 0,
    published: 0,
    byChannel: {},
  });
  const [nextPlans, setNextPlans] = useState<PlanRow[]>([]);
  const [trend, setTrend] = useState<{ month: string; views: number; visitors: number }[]>([]);

  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryMsg, setSummaryMsg] = useState(""); // 총평 실패 알림 [AUDIT M-5]
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    if (!selectedClientId) return;
    const supabase = createClient();

    async function load() {
      // 기존 리포트
      const { data: report } = await supabase
        .from("reports")
        .select("*")
        .eq("client_id", selectedClientId)
        .eq("year_month", ym)
        .maybeSingle();
      setGsc(report?.gsc_snapshot ?? null);
      setGa4(report?.ga4_snapshot ?? null);
      setNaver(report?.naver_manual_metrics ?? defaultNaverMetrics());
      setSummary(report?.ai_summary ?? "");
      setStatus(report?.status ?? "draft");
      setAnalyticsMsg("");
      setSaveMsg("");

      // 발행 콘텐츠 집계
      const { start, end } = monthRange(ym);
      const { data: contents } = await supabase
        .from("contents")
        .select("channel, wp_post_id, published_at, created_at")
        .eq("client_id", selectedClientId)
        .gte("created_at", `${start}T00:00:00`)
        .lte("created_at", `${end}T23:59:59`);
      const rows = (contents ?? []) as {
        channel: string;
        wp_post_id: number | null;
        published_at: string | null;
      }[];
      const byChannel: Record<string, number> = {};
      let published = 0;
      for (const r of rows) {
        byChannel[r.channel] = (byChannel[r.channel] ?? 0) + 1;
        if (r.wp_post_id || r.published_at) published++;
      }
      setContentSummary({ total: rows.length, published, byChannel });

      // 다음 달 플랜
      const nm = nextYm(ym);
      const nmr = monthRange(nm);
      const { data: plans } = await supabase
        .from("content_plans")
        .select("title, channel, scheduled_date")
        .eq("client_id", selectedClientId)
        .gte("scheduled_date", nmr.start)
        .lte("scheduled_date", nmr.end)
        .order("scheduled_date");
      setNextPlans((plans ?? []) as PlanRow[]);

      // 월별 추이(네이버)
      const { data: past } = await supabase
        .from("reports")
        .select("year_month, naver_manual_metrics")
        .eq("client_id", selectedClientId)
        .order("year_month");
      const t = ((past ?? []) as {
        year_month: string;
        naver_manual_metrics: NaverManualMetrics | null;
      }[])
        .filter((p) => p.naver_manual_metrics)
        .map((p) => ({
          month: p.year_month,
          views: p.naver_manual_metrics?.blog_total_views ?? 0,
          visitors: p.naver_manual_metrics?.blog_visitor_count ?? 0,
        }));
      setTrend(t);
    }
    void load();
  }, [selectedClientId, ym]);

  async function fetchAnalytics() {
    if (!selectedClientId) return;
    setLoadingAnalytics(true);
    setAnalyticsMsg("");
    try {
      const res = await fetch("/api/reports/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClientId, yearMonth: ym }),
      });
      const d = await res.json();
      setGsc(d.gsc ?? null);
      setGa4(d.ga4 ?? null);
      const errs = [d.gscError, d.ga4Error].filter(Boolean);
      setAnalyticsMsg(errs.length ? errs.join(" · ") : "성과 불러오기 완료");
    } catch (e) {
      setAnalyticsMsg(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoadingAnalytics(false);
    }
  }

  async function genSummary() {
    if (!selectedClientId) return;
    setLoadingSummary(true);
    setSummaryMsg("");
    try {
      const res = await fetch("/api/reports/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          yearMonth: ym,
          data: { content_summary: contentSummary, gsc, ga4, naver, next_month_plans: nextPlans },
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setSummary(d.summary);
      } else {
        setSummaryMsg(`총평 생성 실패: ${d.error ?? "알 수 없음"}`);
      }
    } catch (e) {
      setSummaryMsg(e instanceof Error ? e.message : "총평 생성 실패");
    } finally {
      setLoadingSummary(false);
    }
  }

  async function save(newStatus?: "draft" | "final") {
    if (!selectedClientId) return;
    const st = newStatus ?? status;
    const res = await saveReport(selectedClientId, ym, {
      gsc_snapshot: gsc,
      ga4_snapshot: ga4,
      naver_manual_metrics: naver,
      content_summary: contentSummary as unknown as Record<string, unknown>,
      next_month_plans: { plans: nextPlans },
      ai_summary: summary,
      status: st,
    });
    setStatus(st);
    setSaveMsg(res.ok ? "저장됨" : `저장 실패: ${res.error}`);
    setTimeout(() => setSaveMsg(""), 2000);
  }

  if (!selectedClientId) {
    return <p className="text-sm text-muted">상단에서 클라이언트를 선택하세요.</p>;
  }

  const g = gsc as {
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
    topQueries?: { query: string; clicks: number; impressions: number }[];
  } | null;
  const a = ga4 as {
    sessions?: number;
    totalUsers?: number;
    screenPageViews?: number;
    averageSessionDuration?: number;
  } | null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">월간 리포트</h1>
          <p className="mt-1 text-sm text-muted">{selectedClient?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          />
          <span
            className={[
              "rounded-full px-2.5 py-1 text-xs font-medium",
              status === "final"
                ? "bg-accent-deep text-white"
                : "bg-subtle text-muted",
            ].join(" ")}
          >
            {status === "final" ? "확정" : "초안"}
          </span>
        </div>
      </div>

      {/* ① 요약 + AI 총평 */}
      <Section title="① 요약 + AI 총평">
        <button
          onClick={genSummary}
          disabled={loadingSummary}
          className="mb-3 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
        >
          {loadingSummary ? "생성 중…" : "AI 총평 생성"}
        </button>
        {summaryMsg && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {summaryMsg}
          </p>
        )}
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={5}
          placeholder="AI 총평을 생성하거나 직접 작성하세요."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent-deep"
        />
      </Section>

      {/* ② 발행 콘텐츠 */}
      <Section title="② 발행 콘텐츠 (자동 집계)">
        <div className="flex flex-wrap gap-6 text-sm">
          <Stat label="총 생성" value={`${contentSummary.total}건`} />
          <Stat label="발행" value={`${contentSummary.published}건`} />
          {Object.entries(contentSummary.byChannel).map(([ch, n]) => (
            <Stat key={ch} label={channelLabel(ch)} value={`${n}건`} />
          ))}
        </div>
      </Section>

      {/* ③ 홈페이지 성과 */}
      <Section title="③ 홈페이지 성과 (GSC / GA4)">
        <button
          onClick={fetchAnalytics}
          disabled={loadingAnalytics}
          className="mb-3 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-subtle disabled:opacity-50"
        >
          {loadingAnalytics ? "불러오는 중…" : "성과 불러오기"}
        </button>
        {analyticsMsg && <p className="mb-3 text-xs text-muted">{analyticsMsg}</p>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-semibold text-ink">GSC</p>
            {g ? (
              <div className="space-y-1 text-sm text-muted">
                <div>클릭 {Math.round(g.clicks ?? 0).toLocaleString()}</div>
                <div>노출 {Math.round(g.impressions ?? 0).toLocaleString()}</div>
                <div>CTR {((g.ctr ?? 0) * 100).toFixed(1)}%</div>
                <div>평균순위 {(g.position ?? 0).toFixed(1)}</div>
                {g.topQueries && g.topQueries.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-ink">상위 쿼리</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {g.topQueries.slice(0, 10).map((q, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="truncate">{q.query}</span>
                          <span className="font-mono">{q.clicks}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">데이터 없음</p>
            )}
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-semibold text-ink">GA4</p>
            {a ? (
              <div className="space-y-1 text-sm text-muted">
                <div>세션 {Math.round(a.sessions ?? 0).toLocaleString()}</div>
                <div>사용자 {Math.round(a.totalUsers ?? 0).toLocaleString()}</div>
                <div>페이지뷰 {Math.round(a.screenPageViews ?? 0).toLocaleString()}</div>
                <div>
                  평균 체류 {Math.round(a.averageSessionDuration ?? 0)}초
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">데이터 없음</p>
            )}
          </div>
        </div>
      </Section>

      {/* ④ 네이버 성과 */}
      <Section title="④ 네이버 성과 (수동 입력)">
        <NaverMetricsForm
          clientId={selectedClientId}
          value={naver}
          onChange={setNaver}
        />
        {trend.length > 1 && (
          <div className="mt-4 h-56">
            <p className="mb-2 text-sm font-semibold text-ink">월별 추이</p>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e9e7" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="views" name="조회수" stroke="#057A4E" />
                <Line type="monotone" dataKey="visitors" name="방문자" stroke="#00E87B" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* ⑤ 다음 달 플랜 */}
      <Section title={`⑤ 다음 달 플랜 (${nextYm(ym)})`}>
        {nextPlans.length === 0 ? (
          <p className="text-sm text-muted">예정된 플랜이 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {nextPlans.map((p, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate text-ink">{p.title}</span>
                <span className="shrink-0 text-xs text-muted">
                  {p.scheduled_date} · {channelLabel(p.channel)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 저장 / 내보내기 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => save()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink hover:opacity-90"
        >
          저장(초안)
        </button>
        <button
          onClick={() => save("final")}
          className="rounded-md bg-accent-deep px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          확정 저장
        </button>
        {saveMsg && <span className="text-xs text-muted">{saveMsg}</span>}
        <ReportExport
          clientId={selectedClientId}
          clientName={selectedClient?.name ?? ""}
          yearMonth={ym}
          report={{
            content_summary: contentSummary,
            gsc,
            ga4,
            naver_manual_metrics: naver,
            next_month_plans: nextPlans,
            ai_summary: summary,
          }}
        />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-bold text-ink">{value}</p>
    </div>
  );
}
