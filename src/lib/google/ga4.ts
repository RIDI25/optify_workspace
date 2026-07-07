import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { getServiceAccount } from "@/lib/google/service-account";

export interface Ga4Snapshot {
  sessions: number;
  totalUsers: number;
  screenPageViews: number;
  averageSessionDuration: number; // 초
  /** 일별 추이 (차트용) — date는 'YYYYMMDD' */
  daily: { date: string; sessions: number; totalUsers: number }[];
  /** 유입 채널별 세션 (Organic Search / Direct / …) */
  channels: { channel: string; sessions: number }[];
  /** 조회수 상위 페이지 10개 */
  topPages: { path: string; views: number }[];
}

/** GA4 runReport — 기간 합계 + 일별 추이 + 채널별 + 인기 페이지. propertyId는 숫자 문자열. */
export async function fetchGa4Snapshot(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Ga4Snapshot> {
  const sa = getServiceAccount();
  const client = new BetaAnalyticsDataClient({
    credentials: { client_email: sa.client_email, private_key: sa.private_key },
    projectId: sa.project_id,
  });
  const property = `properties/${propertyId}`;
  const dateRanges = [{ startDate, endDate }];

  const [[totals], [byDate], [byChannel], [byPage]] = await Promise.all([
    client.runReport({
      property,
      dateRanges,
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
      ],
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 31,
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 8,
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    }),
  ]);

  const row = totals.rows?.[0];
  const val = (i: number) => Number(row?.metricValues?.[i]?.value ?? 0);

  return {
    sessions: val(0),
    totalUsers: val(1),
    screenPageViews: val(2),
    averageSessionDuration: val(3),
    daily: (byDate.rows ?? []).map((r) => ({
      date: r.dimensionValues?.[0]?.value ?? "",
      sessions: Number(r.metricValues?.[0]?.value ?? 0),
      totalUsers: Number(r.metricValues?.[1]?.value ?? 0),
    })),
    channels: (byChannel.rows ?? []).map((r) => ({
      channel: r.dimensionValues?.[0]?.value ?? "",
      sessions: Number(r.metricValues?.[0]?.value ?? 0),
    })),
    topPages: (byPage.rows ?? []).map((r) => ({
      path: r.dimensionValues?.[0]?.value ?? "",
      views: Number(r.metricValues?.[0]?.value ?? 0),
    })),
  };
}
