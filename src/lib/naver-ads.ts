import crypto from "node:crypto";

const BASE = "https://api.searchad.naver.com";

export interface NaverKeywordIdea {
  keyword: string;
  monthlyPc: number;
  monthlyMobile: number;
  monthlyTotal: number;
  pcCtr: number;
  mobileCtr: number;
  competition: string; // 높음 | 중간 | 낮음
  /** 월평균 노출 광고수 (plAvgDepth) */
  avgAdDepth: number;
}

/** 네이버는 저볼륨을 "< 10" 문자열로 반환 — 숫자로 강제 */
function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  const digits = String(v ?? "").replace(/[^0-9.]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function sign(secret: string, ts: string, method: string, uri: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${method}.${uri}`)
    .digest("base64");
}

async function callKeywordstool(hints: string[]): Promise<Response> {
  const apiKey = process.env.NAVER_AD_API_KEY!;
  const secret = process.env.NAVER_AD_SECRET_KEY!;
  const customer = process.env.NAVER_AD_CUSTOMER_ID!;
  const uri = "/keywordstool";
  const ts = String(Date.now());
  const signature = sign(secret, ts, "GET", uri);
  // 네이버 키워드도구는 공백을 제거한 힌트를 기대
  const hintKeywords = hints.map((h) => h.replace(/\s+/g, "")).join(",");
  const url = `${BASE}${uri}?hintKeywords=${encodeURIComponent(hintKeywords)}&showDetail=1`;
  return fetch(url, {
    headers: {
      "X-Timestamp": ts,
      "X-API-KEY": apiKey,
      "X-Customer": customer,
      "X-Signature": signature,
    },
  });
}

/**
 * 네이버 검색광고 키워드도구 — 연관 키워드 + 월간 검색량/클릭률/경쟁정도.
 * hintKeywords 최대 5개. 429 시 백오프 재시도 1회.
 */
export async function fetchNaverKeywordIdeas(
  seeds: string[],
): Promise<NaverKeywordIdea[]> {
  const hints = seeds
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (hints.length === 0) return [];

  let res = await callKeywordstool(hints);
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await callKeywordstool(hints);
    if (res.status === 429) {
      throw new Error(
        "네이버 API 요청이 많습니다(429). 잠시 후 다시 시도해주세요.",
      );
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`네이버 API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    keywordList?: {
      relKeyword?: string;
      monthlyPcQcCnt?: number | string;
      monthlyMobileQcCnt?: number | string;
      monthlyAvePcCtr?: number | string;
      monthlyAveMobileCtr?: number | string;
      compIdx?: string;
      plAvgDepth?: number | string;
    }[];
  };

  return (data.keywordList ?? []).map((r) => {
    const pc = toNum(r.monthlyPcQcCnt);
    const mo = toNum(r.monthlyMobileQcCnt);
    return {
      keyword: r.relKeyword ?? "",
      monthlyPc: pc,
      monthlyMobile: mo,
      monthlyTotal: pc + mo,
      pcCtr: toNum(r.monthlyAvePcCtr),
      mobileCtr: toNum(r.monthlyAveMobileCtr),
      competition: r.compIdx ?? "-",
      avgAdDepth: toNum(r.plAvgDepth),
    };
  });
}
