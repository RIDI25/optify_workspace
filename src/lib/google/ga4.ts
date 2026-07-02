import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { getServiceAccount } from "@/lib/google/service-account";

export interface Ga4Snapshot {
  sessions: number;
  totalUsers: number;
  screenPageViews: number;
  averageSessionDuration: number; // 초
}

/** GA4 runReport — 기간 세션/사용자/조회수/평균 체류시간. propertyId는 숫자 문자열. */
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

  const [report] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "screenPageViews" },
      { name: "averageSessionDuration" },
    ],
  });

  const row = report.rows?.[0];
  const val = (i: number) => Number(row?.metricValues?.[i]?.value ?? 0);
  return {
    sessions: val(0),
    totalUsers: val(1),
    screenPageViews: val(2),
    averageSessionDuration: val(3),
  };
}
