"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// 검증된 팔레트 (CVD ΔE 72) — GSC=브랜드 딥그린, GA4=블루
const C_GSC = "#057A4E";
const C_GA4 = "#2a78d6";
const C_GRID = "#e4e9e7";
const C_AXIS = "#9aa5a0";

export interface GscData {
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  topQueries?: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[];
  daily?: { date: string; clicks: number; impressions: number }[];
  topPages?: {
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[];
  devices?: { device: string; clicks: number; impressions: number }[];
}

export interface Ga4Data {
  sessions?: number;
  totalUsers?: number;
  screenPageViews?: number;
  averageSessionDuration?: number;
  daily?: { date: string; sessions: number; totalUsers: number }[];
  channels?: { channel: string; sessions: number }[];
  topPages?: { path: string; views: number }[];
}

function compact(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, "")}만`;
  return n.toLocaleString();
}

/** '2026-07-01' | '20260701' → '07.01' */
function dayLabel(date: string): string {
  const d = date.replaceAll("-", "");
  return `${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

const DEVICE_LABELS: Record<string, string> = {
  DESKTOP: "PC",
  MOBILE: "모바일",
  TABLET: "태블릿",
};

/** 구글 성과 시각화 — GSC(그린) + GA4(블루) */
export function GoogleAnalyticsPanel({
  gsc,
  ga4,
}: {
  gsc: GscData | null;
  ga4: Ga4Data | null;
}) {
  if (!gsc && !ga4) {
    return (
      <p className="rounded-md bg-subtle px-3 py-2 text-sm text-muted">
        아직 데이터가 없습니다. <b>구글 데이터 불러오기</b>를 눌러 GSC·GA4
        성과를 가져오세요.
      </p>
    );
  }

  const gscDaily = (gsc?.daily ?? []).map((d) => ({
    label: dayLabel(d.date),
    클릭: d.clicks,
    노출: d.impressions,
  }));
  const ga4Daily = (ga4?.daily ?? []).map((d) => ({
    label: dayLabel(d.date),
    세션: d.sessions,
    사용자: d.totalUsers,
  }));
  const deviceTotal = (gsc?.devices ?? []).reduce((s, d) => s + d.clicks, 0);

  return (
    <div className="space-y-4">
      {/* ── GSC ── */}
      {gsc && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-ink">
            🟢 검색 성과 (Search Console)
          </h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="클릭" value={compact(Math.round(gsc.clicks ?? 0))} />
            <Kpi label="노출" value={compact(Math.round(gsc.impressions ?? 0))} />
            <Kpi label="CTR" value={`${((gsc.ctr ?? 0) * 100).toFixed(1)}%`} />
            <Kpi label="평균 순위" value={(gsc.position ?? 0).toFixed(1)} />
          </div>

          {gscDaily.length > 1 && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <ChartCard title="일별 클릭">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gscDaily} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} vertical={false} />
                    <XAxis dataKey="label" fontSize={10} stroke={C_AXIS} tickLine={false} interval="preserveStartEnd" />
                    <YAxis fontSize={10} stroke={C_AXIS} tickFormatter={compact} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => Number(v).toLocaleString()} contentStyle={{ fontSize: 12 }} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Bar dataKey="클릭" fill={C_GSC} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="일별 노출">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={gscDaily} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} vertical={false} />
                    <XAxis dataKey="label" fontSize={10} stroke={C_AXIS} tickLine={false} interval="preserveStartEnd" />
                    <YAxis fontSize={10} stroke={C_AXIS} tickFormatter={compact} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => Number(v).toLocaleString()} contentStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="노출" stroke={C_GSC} strokeWidth={2} fill={C_GSC} fillOpacity={0.12} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* 상위 쿼리 */}
            {(gsc.topQueries?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-xs font-semibold text-ink">상위 검색어 TOP 10</p>
                <table className="w-full text-xs">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="py-1 font-medium">검색어</th>
                      <th className="py-1 text-right font-medium">클릭</th>
                      <th className="py-1 text-right font-medium">노출</th>
                      <th className="py-1 text-right font-medium">CTR</th>
                      <th className="py-1 text-right font-medium">순위</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gsc.topQueries!.slice(0, 10).map((q) => (
                      <tr key={q.query} className="border-t border-border/60">
                        <td className="max-w-0 truncate py-1.5 pr-2 font-medium text-ink" title={q.query}>
                          {q.query}
                        </td>
                        <td className="py-1.5 text-right font-mono">{q.clicks.toLocaleString()}</td>
                        <td className="py-1.5 text-right font-mono text-muted">{compact(Math.round(q.impressions))}</td>
                        <td className="py-1.5 text-right font-mono text-muted">{(q.ctr * 100).toFixed(1)}%</td>
                        <td className="py-1.5 text-right font-mono text-muted">{q.position.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-3">
              {/* 기기별 클릭 */}
              {(gsc.devices?.length ?? 0) > 0 && deviceTotal > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold text-ink">기기별 클릭</p>
                  <BarList
                    color={C_GSC}
                    items={gsc.devices!.map((d) => ({
                      label: DEVICE_LABELS[d.device] ?? d.device,
                      value: d.clicks,
                      sub: `${((d.clicks / deviceTotal) * 100).toFixed(0)}%`,
                    }))}
                  />
                </div>
              )}
              {/* 상위 페이지 */}
              {(gsc.topPages?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold text-ink">클릭 상위 페이지</p>
                  <BarList
                    color={C_GSC}
                    items={gsc.topPages!.slice(0, 5).map((p) => ({
                      label: pathOf(p.page),
                      value: p.clicks,
                    }))}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── GA4 ── */}
      {ga4 && (
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-bold text-ink">🔵 방문 분석 (GA4)</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="세션" value={compact(Math.round(ga4.sessions ?? 0))} blue />
            <Kpi label="사용자" value={compact(Math.round(ga4.totalUsers ?? 0))} blue />
            <Kpi label="페이지뷰" value={compact(Math.round(ga4.screenPageViews ?? 0))} blue />
            <Kpi label="평균 체류" value={`${Math.round(ga4.averageSessionDuration ?? 0)}초`} blue />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {ga4Daily.length > 1 && (
              <ChartCard title="일별 세션">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ga4Daily} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} vertical={false} />
                    <XAxis dataKey="label" fontSize={10} stroke={C_AXIS} tickLine={false} interval="preserveStartEnd" />
                    <YAxis fontSize={10} stroke={C_AXIS} tickFormatter={compact} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => Number(v).toLocaleString()} contentStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="세션" stroke={C_GA4} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
            <div className="space-y-3">
              {(ga4.channels?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold text-ink">유입 채널별 세션</p>
                  <BarList
                    color={C_GA4}
                    items={ga4.channels!.map((c) => ({ label: c.channel, value: c.sessions }))}
                  />
                </div>
              )}
              {(ga4.topPages?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold text-ink">인기 페이지 TOP 5</p>
                  <BarList
                    color={C_GA4}
                    items={ga4.topPages!.slice(0, 5).map((p) => ({ label: p.path, value: p.views }))}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

function Kpi({ label, value, blue }: { label: string; value: string; blue?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className="mt-0.5 font-mono text-xl font-bold"
        style={{ color: blue ? C_GA4 : C_GSC }}
      >
        {value}
      </p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-xs font-semibold text-ink">{title}</p>
      <div className="h-40">{children}</div>
    </div>
  );
}

function BarList({
  items,
  color,
}: {
  items: { label: string; value: number; sub?: string }[];
  color: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-ink" title={it.label}>
            {it.label}
          </span>
          <span className="h-3.5 flex-1 overflow-hidden rounded bg-subtle">
            <span
              className="block h-full rounded"
              style={{ background: color, width: `${Math.max((it.value / max) * 100, 2)}%` }}
            />
          </span>
          <span className="w-14 shrink-0 text-right font-mono text-muted">
            {compact(it.value)}
            {it.sub ? ` · ${it.sub}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
