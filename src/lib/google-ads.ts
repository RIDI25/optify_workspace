import { GoogleAdsApi, enums } from "google-ads-api";

/** 한국 geo target constant / 한국어 language constant (기본값) */
const KOREA_GEO = "geoTargetConstants/2410";
const KOREAN_LANG = "languageConstants/1012";

export interface KeywordIdea {
  keyword: string;
  avgMonthlySearches: number | null;
  competition: string | null;
  cpcLow: number | null;
  cpcHigh: number | null;
}

function fromMicros(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n / 1_000_000 : null;
}

/** competition은 응답에서 이미 'LOW'|'MEDIUM'|'HIGH' 문자열로 옴. 숫자 enum이면 이름으로 변환. */
function competitionName(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") {
    return (enums.KeywordPlanCompetitionLevel[v] as string | undefined) ?? String(v);
  }
  return String(v);
}

interface IdeaRow {
  text?: string | null;
  keyword_idea_metrics?: {
    avg_monthly_searches?: number | string | null;
    competition?: string | number | null;
    low_top_of_page_bid_micros?: number | string | null;
    high_top_of_page_bid_micros?: number | string | null;
  } | null;
}

/** Google Ads Keyword Planner — 시드 키워드로 연관 키워드 아이디어 조회 */
export async function generateKeywordIdeas(
  seeds: string[],
): Promise<KeywordIdea[]> {
  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  });

  const customer = client.Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  });

  const request = {
    // customer_id는 이 호출에 명시 필요(라이브러리가 자동 주입하지 않음)
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    language: KOREAN_LANG,
    geo_target_constants: [KOREA_GEO],
    include_adult_keywords: false,
    keyword_plan_network: enums.KeywordPlanNetwork.GOOGLE_SEARCH_AND_PARTNERS,
    keyword_seed: { keywords: seeds.map((s) => s.trim()).filter(Boolean) },
  };

  console.log("[keywords] request:", {
    customer_id: request.customer_id,
    language: request.language,
    geo_target_constants: request.geo_target_constants,
    keyword_plan_network: request.keyword_plan_network,
    keywords: request.keyword_seed.keywords,
  });

  // ⚠️ 이 호출은 결과 배열을 '직접' 반환한다(‘.results’ 프로퍼티 아님).
  const response = await customer.keywordPlanIdeas.generateKeywordIdeas(
    request as Parameters<
      typeof customer.keywordPlanIdeas.generateKeywordIdeas
    >[0],
  );
  const results = response as unknown as IdeaRow[];
  console.log(
    "[keywords] raw response — isArray:",
    Array.isArray(response),
    "| count:",
    results.length,
  );

  return results.map((row) => {
    const m = row.keyword_idea_metrics;
    return {
      keyword: row.text ?? "",
      avgMonthlySearches:
        m?.avg_monthly_searches != null ? Number(m.avg_monthly_searches) : null,
      competition: competitionName(m?.competition),
      cpcLow: fromMicros(m?.low_top_of_page_bid_micros),
      cpcHigh: fromMicros(m?.high_top_of_page_bid_micros),
    };
  });
}
