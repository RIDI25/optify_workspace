import type { KeywordIdea, MonthlySearchVolume } from "@/lib/google-ads";
import type { NaverKeywordIdea } from "@/lib/naver-ads";

/** /api/keywords/report 응답 — 네이버+구글 통합 키워드 리포트 */
export interface KeywordReport {
  keyword: string;
  naver: {
    /** 검색 키워드 본인의 지표 (네이버가 못 찾으면 null) */
    main: NaverKeywordIdea | null;
    /** 연관 키워드 (검색량 내림차순) */
    related: NaverKeywordIdea[];
    /** 키워드 → 블로그 문서량. 오픈API 키 없으면 null */
    docCounts: Record<string, number> | null;
  };
  google: {
    main: KeywordIdea | null;
    related: KeywordIdea[];
    /** 메인 키워드 최근 12개월 검색량 추이 */
    trend: MonthlySearchVolume[] | null;
  };
  /** 부분 실패·키 미설정 등 안내 메시지 */
  warnings: string[];
}
