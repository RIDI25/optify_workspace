import type { CollectResult } from "@/lib/daily-report/collect";

/** AI가 생성하는 데일리 리포트 본문 */
export interface DailyReportContent {
  /** 오늘의 헤드라인 3줄 */
  headlines: string[];
  /** 주요 소식 상세 3~5건 */
  stories: {
    title: string;
    source: string;
    url: string;
    what: string; // 무엇이 바뀌었나
    impact: string; // 병의원·법률·세무 클라이언트 영향
    angle: string; // 콘텐츠 소재 활용 각도
  }[];
  /** 콘텐츠 소재 제안 1~2건 */
  suggestions: {
    channel: "옵티파이" | "리디웹" | "강의·발표";
    title: string; // 가제
    keyword: string; // 타깃 키워드
    reason: string;
  }[];
  /** 확인했으나 제외한 소식 (중복 확인 방지용) */
  passed: { title: string; source: string; reason: string }[];
}

export interface DailyReportRow {
  id: string;
  report_date: string; // YYYY-MM-DD
  collected: CollectResult | null;
  report: DailyReportContent | null;
  created_at: string;
}
