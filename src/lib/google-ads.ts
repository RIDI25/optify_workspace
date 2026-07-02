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
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    language: KOREAN_LANG,
    geo_target_constants: [KOREA_GEO],
    include_adult_keywords: false,
    keyword_plan_network: enums.KeywordPlanNetwork.GOOGLE_SEARCH_AND_PARTNERS,
    keyword_seed: { keywords: seeds.filter((s) => s.trim()) },
    page_token: "",
    page_size: 0,
  };

  type IdeaRow = {
    text?: string | null;
    keyword_idea_metrics?: {
      avg_monthly_searches?: number | string | null;
      competition?: number | null;
      low_top_of_page_bid_micros?: number | string | null;
      high_top_of_page_bid_micros?: number | string | null;
    } | null;
  };

  const response = await customer.keywordPlanIdeas.generateKeywordIdeas(
    request as Parameters<
      typeof customer.keywordPlanIdeas.generateKeywordIdeas
    >[0],
  );
  const results = (response.results ?? []) as IdeaRow[];

  const competitionName = (v: number | null | undefined): string | null => {
    if (v == null) return null;
    const name = enums.KeywordPlanCompetitionLevel[v] as string | undefined;
    return name ?? String(v);
  };

  return results.map((row) => {
    const m = row.keyword_idea_metrics;
    return {
      keyword: row.text ?? "",
      avgMonthlySearches: m?.avg_monthly_searches
        ? Number(m.avg_monthly_searches)
        : null,
      competition: competitionName(m?.competition),
      cpcLow: fromMicros(m?.low_top_of_page_bid_micros),
      cpcHigh: fromMicros(m?.high_top_of_page_bid_micros),
    };
  });
}
