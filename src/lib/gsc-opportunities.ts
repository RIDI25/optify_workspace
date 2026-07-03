/**
 * GSC 상위 쿼리 → 기회 키워드 분류 [B-4].
 * 기준은 상수로 분리해 조정 가능하게.
 */
export const OPPORTUNITY = {
  /** 노출은 높은데 클릭이 낮은 쿼리 */
  lowCtr: { minImpressions: 100, maxCtr: 0.02 }, // 노출 100+ & CTR 2% 이하
  /** 2페이지 진입 직전(11~20위) */
  secondPage: { posMin: 10.5, posMax: 20.5 },
} as const;

export interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface Opportunities {
  lowCtr: GscQueryRow[];
  secondPage: GscQueryRow[];
}

export function classifyOpportunities(rows: GscQueryRow[]): Opportunities {
  const lowCtr = rows
    .filter(
      (r) =>
        r.impressions >= OPPORTUNITY.lowCtr.minImpressions &&
        r.ctr <= OPPORTUNITY.lowCtr.maxCtr,
    )
    .sort((a, b) => b.impressions - a.impressions);
  const secondPage = rows
    .filter(
      (r) =>
        r.position >= OPPORTUNITY.secondPage.posMin &&
        r.position <= OPPORTUNITY.secondPage.posMax,
    )
    .sort((a, b) => a.position - b.position);
  return { lowCtr, secondPage };
}
