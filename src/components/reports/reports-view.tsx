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
import { saveKeywordFromGsc, addTopicToPlan } from "@/lib/actions/keywords";
import {
  classifyOpportunities,
  type GscQueryRow,
} from "@/lib/gsc-opportunities";
import type { ChannelSettings, SectionReports } from "@/types/database";
import {
  NaverMetricsForm,
  defaultNaverMetrics,
} from "@/components/reports/naver-metrics-form";
import {
  GoogleAnalyticsPanel,
  type GscData,
  type Ga4Data,
} from "@/components/reports/google-analytics-panel";
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

type ReportScope = "google" | "naver" | "overall";

export function ReportsView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [ym, setYm] = useState(currentYm());

  const [gsc, setGsc] = useState<Record<string, unknown> | null>(null);
  const [ga4, setGa4] = useState<Record<string, unknown> | null>(null);
  const [analyticsMsg, setAnalyticsMsg] = useState("");
  const [naver, setNaver] = useState<NaverManualMetrics>(defaultNaverMetrics());

  // 3단 리포트 텍스트
  const [googleReport, setGoogleReport] = useState("");
  const [naverReport, setNaverReport] = useState("");
  const [summary, setSummary] = useState(""); // 종합 (ai_summary)
  const [status, setStatus] = useState<"draft" | "final">("draft");

  const [contentSummary, setContentSummary] = useState<ContentSummary>({
    total: 0,
    published: 0,
    byChannel: {},
  });
  const [nextPlans, setNextPlans] = useState<PlanRow[]>([]);
  const [trend, setTrend] = useState<
    { month: string; views: number; visitors: number }[]
  >([]);

  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [genBusy, setGenBusy] = useState<ReportScope | null>(null);
  const [genMsg, setGenMsg] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  // 기회 키워드 [B-4]
  const [channels, setChannels] = useState<ChannelSettings[]>([]);
  const [oppChannel, setOppChannel] = useState("");
  const [savedKw, setSavedKw] = useState<Set<string>>(new Set());
  const [addedPlan, setAddedPlan] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedClientId) return;
    createClient()
      .from("channel_settings")
      .select("id, channel")
      .eq("client_id", selectedClientId)
      .eq("is_active", true)
      .then(({ data }) => setChannels((data ?? []) as ChannelSettings[]));
  }, [selectedClientId]);

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
      const sections = (report?.section_reports ?? {}) as SectionReports;
      setGoogleReport(sections.google ?? "");
      setNaverReport(sections.naver ?? "");
      setSummary(report?.ai_summary ?? "");
      setStatus(report?.status ?? "draft");
      setAnalyticsMsg("");
      setGenMsg("");
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
      const t = (
        (past ?? []) as {
          year_month: string;
          naver_manual_metrics: NaverManualMetrics | null;
        }[]
      )
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
      setAnalyticsMsg(errs.length ? errs.join(" · ") : "구글 데이터 불러오기 완료");
    } catch (e) {
      setAnalyticsMsg(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoadingAnalytics(false);
    }
  }

  /** 스코프별 AI 리포트 생성 (google / naver / overall) */
  async function genReport(scope: ReportScope) {
    if (!selectedClientId) return;
    setGenBusy(scope);
    setGenMsg("");
    const data =
      scope === "google"
        ? { gsc, ga4 }
        : scope === "naver"
          ? { naver_manual_metrics: naver, monthly_trend: trend }
          : {
              google_report: googleReport,
              naver_report: naverReport,
              content_summary: contentSummary,
              next_month_plans: nextPlans,
            };
    try {
      const res = await fetch("/api/reports/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          yearMonth: ym,
          scope,
          data,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        if (scope === "google") setGoogleReport(d.summary);
        else if (scope === "naver") setNaverReport(d.summary);
        else setSummary(d.summary);
      } else {
        setGenMsg(`리포트 생성 실패: ${d.error ?? "알 수 없음"}`);
      }
    } catch (e) {
      setGenMsg(e instanceof Error ? e.message : "리포트 생성 실패");
    } finally {
      setGenBusy(null);
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
      section_reports: { google: googleReport, naver: naverReport },
      status: st,
    });
    setStatus(st);
    setSaveMsg(
      res.ok ? (res.warning ?? "저장됨") : `저장 실패: ${res.error}`,
    );
    setTimeout(() => setSaveMsg(""), res.warning ? 8000 : 2000);
  }

  const oppCh = oppChannel || channels[0]?.channel || "";
  async function saveKw(query: string) {
    if (!selectedClientId) return;
    const r = await saveKeywordFromGsc(selectedClientId, query);
    if (r.ok) setSavedKw((prev) => new Set(prev).add(query));
  }
  async function addPlan(query: string) {
    if (!selectedClientId || !oppCh) return;
    const r = await addTopicToPlan({
      clientId: selectedClientId,
      channel: oppCh,
      title: query,
    });
    if (r.ok) setAddedPlan((prev) => new Set(prev).add(query));
  }

  if (!selectedClientId) {
    return <p className="text-sm text-muted">상단에서 클라이언트를 선택하세요.</p>;
  }

  const g = gsc as GscData | null;
  const a = ga4 as Ga4Data | null;
  const opportunities = g?.topQueries
    ? classifyOpportunities(g.topQueries as GscQueryRow[])
    : null;

  const hasGoogleData = !!(g || a);
  const naverFilled =
    (naver.blog_total_views ?? 0) > 0 ||
    (naver.blog_visitor_count ?? 0) > 0 ||
    (naver.top_inflow_keywords?.length ?? 0) > 0;

  const steps = [
    { n: 1, label: "구글 리포트", done: !!googleReport.trim() },
    { n: 2, label: "네이버 리포트", done: !!naverReport.trim() },
    { n: 3, label: "종합 리포트", done: !!summary.trim() },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">월간 리포트</h1>
          <p className="mt-1 text-sm text-muted">
            {selectedClient?.name} · ① 구글 → ② 네이버 → ③ 종합 순서로
            생성하세요.
          </p>
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

      {/* 진행 단계 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted">→</span>}
            <span
              className={[
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                s.done
                  ? "border-accent-deep/40 bg-tint text-accent-deep"
                  : "border-border bg-surface text-muted",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-flex h-4 w-4 items-center justify-center rounded-full font-mono text-[10px]",
                  s.done ? "bg-accent-deep text-white" : "bg-subtle text-muted",
                ].join(" ")}
              >
                {s.done ? "✓" : s.n}
              </span>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {genMsg && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {genMsg}
        </p>
      )}

      {/* ═══ ① 구글 리포트 ═══ */}
      <Section title="① 구글 성과 (GSC · GA4)">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={fetchAnalytics}
            disabled={loadingAnalytics}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
          >
            {loadingAnalytics ? "불러오는 중…" : "📥 구글 데이터 불러오기"}
          </button>
          {analyticsMsg && <span className="text-xs text-muted">{analyticsMsg}</span>}
        </div>

        <GoogleAnalyticsPanel gsc={g} ga4={a} />

        {/* 기회 키워드 [B-4] */}
        {opportunities &&
          (opportunities.lowCtr.length > 0 ||
            opportunities.secondPage.length > 0) && (
            <div className="mt-4 space-y-3 rounded-md border border-accent-deep/30 bg-tint/30 p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-accent-deep">
                  기회 키워드
                </h3>
                <select
                  value={oppCh}
                  onChange={(e) => setOppChannel(e.target.value)}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
                >
                  {channels.map((c) => (
                    <option key={c.id} value={c.channel}>
                      {channelLabel(c.channel)}
                    </option>
                  ))}
                </select>
              </div>
              <OppList
                title="노출 대비 클릭 낮음 (노출 상위·CTR 하위)"
                rows={opportunities.lowCtr}
                savedKw={savedKw}
                addedPlan={addedPlan}
                onSave={saveKw}
                onAdd={addPlan}
              />
              <OppList
                title="2페이지 진입 직전 (순위 11~20위)"
                rows={opportunities.secondPage}
                savedKw={savedKw}
                addedPlan={addedPlan}
                onSave={saveKw}
                onAdd={addPlan}
              />
            </div>
          )}

        {/* 구글 리포트 생성 */}
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => genReport("google")}
              disabled={genBusy !== null || !hasGoogleData}
              className="rounded-md bg-accent-deep px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {genBusy === "google" ? "생성 중…" : "🤖 구글 리포트 생성"}
            </button>
            {!hasGoogleData && (
              <span className="text-xs text-muted">
                먼저 구글 데이터를 불러오세요.
              </span>
            )}
          </div>
          <textarea
            value={googleReport}
            onChange={(e) => setGoogleReport(e.target.value)}
            rows={6}
            placeholder="구글 데이터 기반 AI 리포트가 여기에 생성됩니다. 직접 수정할 수 있어요."
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent-deep"
          />
        </div>
      </Section>

      {/* ═══ ② 네이버 리포트 ═══ */}
      <Section title="② 네이버 성과 (스크린샷 분석)">
        <p className="mb-3 rounded-md bg-subtle px-3 py-2 text-xs text-muted">
          네이버 블로그 통계 스크린샷을 첨부하고 <b>분석하기</b>를 누르면 AI가
          수치를 자동으로 채워요. 값을 확인·수정한 뒤 네이버 리포트를
          생성하세요.
        </p>
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
                <Line type="monotone" dataKey="views" name="조회수" stroke="#057A4E" strokeWidth={2} />
                <Line type="monotone" dataKey="visitors" name="방문자" stroke="#2a78d6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 네이버 리포트 생성 */}
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => genReport("naver")}
              disabled={genBusy !== null || !naverFilled}
              className="rounded-md bg-accent-deep px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {genBusy === "naver" ? "생성 중…" : "🤖 네이버 리포트 생성"}
            </button>
            {!naverFilled && (
              <span className="text-xs text-muted">
                먼저 스크린샷 분석 또는 수치 입력이 필요해요.
              </span>
            )}
          </div>
          <textarea
            value={naverReport}
            onChange={(e) => setNaverReport(e.target.value)}
            rows={5}
            placeholder="네이버 성과 기반 AI 리포트가 여기에 생성됩니다. 직접 수정할 수 있어요."
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent-deep"
          />
        </div>
      </Section>

      {/* ═══ ③ 종합 리포트 ═══ */}
      <Section title="③ 종합 리포트">
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* 발행 콘텐츠 집계 */}
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-ink">
              발행 콘텐츠 (자동 집계)
            </p>
            <div className="flex flex-wrap gap-5 text-sm">
              <Stat label="총 생성" value={`${contentSummary.total}건`} />
              <Stat label="발행" value={`${contentSummary.published}건`} />
              {Object.entries(contentSummary.byChannel).map(([ch, n]) => (
                <Stat key={ch} label={channelLabel(ch)} value={`${n}건`} />
              ))}
            </div>
          </div>
          {/* 다음 달 플랜 */}
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-ink">
              다음 달 플랜 ({nextYm(ym)})
            </p>
            {nextPlans.length === 0 ? (
              <p className="text-sm text-muted">예정된 플랜이 없습니다.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {nextPlans.slice(0, 6).map((p, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="truncate text-ink">{p.title}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {p.scheduled_date} · {channelLabel(p.channel)}
                    </span>
                  </li>
                ))}
                {nextPlans.length > 6 && (
                  <li className="text-xs text-muted">
                    외 {nextPlans.length - 6}건
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            onClick={() => genReport("overall")}
            disabled={
              genBusy !== null || !googleReport.trim() || !naverReport.trim()
            }
            className="rounded-md bg-accent-deep px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {genBusy === "overall" ? "생성 중…" : "🤖 종합 리포트 생성"}
          </button>
          {(!googleReport.trim() || !naverReport.trim()) && (
            <span className="text-xs text-muted">
              구글·네이버 리포트를 먼저 생성하면 활성화됩니다. (구글{" "}
              {googleReport.trim() ? "✓" : "✗"} · 네이버{" "}
              {naverReport.trim() ? "✓" : "✗"})
            </span>
          )}
        </div>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={8}
          placeholder="구글·네이버 리포트를 종합한 최종 리포트가 여기에 생성됩니다."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent-deep"
        />
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

function OppList({
  title,
  rows,
  savedKw,
  addedPlan,
  onSave,
  onAdd,
}: {
  title: string;
  rows: GscQueryRow[];
  savedKw: Set<string>;
  addedPlan: Set<string>;
  onSave: (q: string) => void;
  onAdd: (q: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="text-xs font-medium text-ink">{title}</p>
        <p className="text-xs text-muted">해당 없음</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li
            key={r.query}
            className="flex items-center justify-between gap-2 rounded-md bg-surface px-2.5 py-1.5 text-xs"
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium text-ink">{r.query}</span>
              <span className="ml-2 text-muted">
                노출 {Math.round(r.impressions).toLocaleString()} · CTR{" "}
                {(r.ctr * 100).toFixed(1)}% · {r.position.toFixed(1)}위
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              <button
                onClick={() => onSave(r.query)}
                disabled={savedKw.has(r.query)}
                className="rounded border border-border px-2 py-0.5 hover:bg-subtle disabled:opacity-50"
              >
                {savedKw.has(r.query) ? "저장됨" : "키워드로 저장"}
              </button>
              <button
                onClick={() => onAdd(r.query)}
                disabled={addedPlan.has(r.query)}
                className="rounded border border-accent-deep px-2 py-0.5 text-accent-deep hover:bg-tint disabled:opacity-50"
              >
                {addedPlan.has(r.query) ? "추가됨" : "플랜에 추가"}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
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
