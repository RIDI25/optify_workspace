import { JWT } from "google-auth-library";
import { getServiceAccount } from "@/lib/google/service-account";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export interface GscSnapshot {
  /** 실제로 조회한 속성 이름 (설정값과 다를 수 있음 — resolveSiteUrl) */
  siteUrl?: string;
  note?: string;
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

/** 서치콘솔 속성 이름 맞추기 — URL 접두 속성은 'https://예시.kr/' 처럼 끝에 / 가 있어야 같은 속성으로 본다 (없으면 403) */
export function normalizeSiteUrl(siteUrl: string): string {
  const s = siteUrl.trim();
  if (/^https?:\/\//i.test(s) && !s.endsWith("/")) return `${s}/`;
  return s;
}

function siteHost(s: string): string {
  return s.replace(/^sc-domain:/i, "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
}

/**
 * 서비스 계정이 볼 수 있는 속성 가운데 설정값과 같은 것을, 없으면 같은 도메인의 것을 고른다.
 * (2026-09-23: 고객사가 URL 속성에 권한을 줬는데 설정은 sc-domain 이라 403 — 이름만 달랐다)
 */
export async function resolveSiteUrl(token: string, configured: string): Promise<{ siteUrl: string; note?: string; available: string[] }> {
  const wanted = normalizeSiteUrl(configured);
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { siteUrl: wanted, available: [] }; // 목록을 못 보면 설정값 그대로
  const data = (await res.json()) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] };
  const entries = (data.siteEntry ?? []).filter((e) => e.permissionLevel !== "siteUnverifiedUser");
  const available = entries.map((e) => e.siteUrl);
  if (available.includes(wanted)) return { siteUrl: wanted, available };
  const host = siteHost(wanted);
  const alt = entries.find((e) => siteHost(e.siteUrl) === host);
  if (alt) return { siteUrl: alt.siteUrl, note: `설정된 '${wanted}' 대신 권한이 있는 같은 도메인 속성 '${alt.siteUrl}' 로 조회했습니다. 기본정보의 GSC 사이트 URL을 이 값으로 바꿔 두세요.`, available };
  return { siteUrl: wanted, available };
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

  if (!token) throw new Error("GSC 인증 토큰 발급 실패 (서비스 계정 키 확인)");
  const resolved = await resolveSiteUrl(token, siteUrl);
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(resolved.siteUrl)}/searchAnalytics/query`;

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
      if (res.status === 403) {
        throw new Error(`GSC 403: '${resolved.siteUrl}' 권한 없음. 서비스 계정이 볼 수 있는 속성: ${resolved.available.join(", ") || "없음"}`);
      }
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
      query(["date"], 400), // 임의 기간(최대 1년) 일별 조회
      query(["page"], 10),
      query(["device"], 3),
    ]);
  const total = totalRows[0] ?? {};

  return {
    siteUrl: resolved.siteUrl,
    note: resolved.note,
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
