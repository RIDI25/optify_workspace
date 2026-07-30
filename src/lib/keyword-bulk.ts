/** 대량 키워드 조회 공용 타입·상수 (라우트 ↔ 클라이언트 공유) */

export const BULK_MAX = 10;

/** 대량 키워드 조회 결과 행 — 연관 확장 없이 입력 키워드의 지표만 */
export interface BulkKeywordRow {
  keyword: string;
  google: {
    avgMonthlySearches: number | null;
    competition: string | null;
    competitionIndex: number | null;
    cpcLow: number | null;
    cpcHigh: number | null;
  } | null;
  naver: {
    monthlyPc: number;
    monthlyMobile: number;
    monthlyTotal: number;
    competition: string;
    avgAdDepth: number;
  } | null;
  /** 네이버 블로그 문서량 (경쟁 포화도 지표) */
  blogDocs: number | null;
}
