import { JWT } from "google-auth-library";
import { getServiceAccount } from "@/lib/google/service-account";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export interface GscSnapshot {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[];
  /** 일별 추이 (차트용) */
  daily: { date: string; clicks: number; impressions: number }[];
  /** 상위 페이지 10개 */
  topPages: {
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[];
  /** 기기별 (DESKTOP/MOBILE/TABLET) */
  devices: { device: string; clicks: number; impressions: number }[];
}

interface GscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

/**
 * GSC Search Analytics query. siteUrl 예: 'sc-domain:optify.kr' 또는 'https://optify.kr/'.
 * 기간 합계 + 상위 쿼리 25개 + 일별 추이 + 상위 페이지 + 기기별.
 */
export async function fetchGscSnapshot(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscSnapshot> {
  const sa = getServiceAccount();
  const jwt = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [GSC_SCOPE],
  });
  const { token } = await jwt.getAccessToken();

  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl,
  )}/searchAnalytics/query`;

  async function query(dimensions: string[], rowLimit: number): Promise<GscRow[]> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ startDate, endDate, dimensions, rowLimit }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GSC ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { rows?: GscRow[] };
    return data.rows ?? [];
  }

  // 합계(무차원 1행) + 쿼리(기회 키워드 분류용 25개) + 일별 + 페이지 + 기기
  const [totalRows, queryRows, dateRows, pageRows, deviceRows] =
    await Promise.all([
      query([], 1),
      query(["query"], 25),
      query(["date"], 31),
      query(["page"], 10),
      query(["device"], 3),
    ]);
  const total = totalRows[0] ?? {};

  return {
    clicks: total.clicks ?? 0,
    impressions: total.impressions ?? 0,
    ctr: total.ctr ?? 0,
    position: total.position ?? 0,
    topQueries: queryRows
      .map((r) => ({
        query: r.keys?.[0] ?? "",
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      }))
      .sort((a, b) => b.clicks - a.clicks),
    daily: dateRows
      .map((r) => ({
        date: r.keys?.[0] ?? "",
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    topPages: pageRows
      .map((r) => ({
        page: r.keys?.[0] ?? "",
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      }))
      .sort((a, b) => b.clicks - a.clicks),
    devices: deviceRows.map((r) => ({
      device: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
    })),
  };
}
