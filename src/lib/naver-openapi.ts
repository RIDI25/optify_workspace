/**
 * 네이버 오픈API (developers.naver.com) — 블로그 검색의 total로 "문서량"을 구한다.
 * 검색광고 API와 별개 키: NAVER_OPENAPI_CLIENT_ID / NAVER_OPENAPI_CLIENT_SECRET (없으면 문서량 생략).
 */

const BLOG_SEARCH_URL = "https://openapi.naver.com/v1/search/blog.json";

export function hasNaverOpenApi(): boolean {
  return !!(
    process.env.NAVER_OPENAPI_CLIENT_ID && process.env.NAVER_OPENAPI_CLIENT_SECRET
  );
}

async function fetchBlogDocCount(keyword: string): Promise<number | null> {
  const res = await fetch(
    `${BLOG_SEARCH_URL}?query=${encodeURIComponent(keyword)}&display=1`,
    {
      headers: {
        "X-Naver-Client-Id": process.env.NAVER_OPENAPI_CLIENT_ID!,
        "X-Naver-Client-Secret": process.env.NAVER_OPENAPI_CLIENT_SECRET!,
      },
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { total?: number };
  return typeof data.total === "number" ? data.total : null;
}

const WEB_SEARCH_URL = "https://openapi.naver.com/v1/search/webkr.json";

/**
 * 네이버 웹문서 검색에서 도메인 노출 여부 확인 (SEO 진단용).
 * 도메인을 질의해 상위 결과 중 해당 도메인 링크 개수를 센다.
 */
export async function fetchNaverSiteExposure(
  domain: string,
): Promise<{ total: number; matched: number } | null> {
  if (!hasNaverOpenApi()) return null;
  try {
    const res = await fetch(
      `${WEB_SEARCH_URL}?query=${encodeURIComponent(domain)}&display=30`,
      {
        headers: {
          "X-Naver-Client-Id": process.env.NAVER_OPENAPI_CLIENT_ID!,
          "X-Naver-Client-Secret": process.env.NAVER_OPENAPI_CLIENT_SECRET!,
        },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      total?: number;
      items?: { link?: string }[];
    };
    const matched = (data.items ?? []).filter((i) => (i.link ?? "").includes(domain)).length;
    return { total: data.total ?? 0, matched };
  } catch {
    return null;
  }
}

/**
 * 키워드별 블로그 문서량 일괄 조회 (동시 3개, 실패한 키워드는 결과에서 제외).
 * 오픈API 일일 한도 25,000건 — 리포트당 십수 건 수준이라 여유롭다.
 */
export async function fetchBlogDocCounts(
  keywords: string[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (!hasNaverOpenApi()) return result;

  const unique = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];
  const CONCURRENCY = 3;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const counts = await Promise.all(
      batch.map((k) => fetchBlogDocCount(k).catch(() => null)),
    );
    batch.forEach((k, j) => {
      const c = counts[j];
      if (c != null) result[k] = c;
    });
  }
  return result;
}
