/** SEO 진단 결과 데이터 모델 — UI·PDF·점수·견적 연결이 공통 사용 */

export type CheckStatus = "pass" | "warn" | "fail" | "info" | "skip";

export interface AuditCheck {
  key: string;
  label: string;
  status: CheckStatus;
  /** 사람이 읽는 결과 설명 (측정값 포함) */
  detail: string;
  /** 실패/경고 시 연결할 견적 품목명 — quote-items.ts의 name과 정확히 일치해야 함 */
  quoteItem?: string;
}

export interface AuditCategory {
  key: "basic" | "indexing" | "structured" | "content" | "performance";
  label: string;
  score: number | null; // null = 측정 불가(skip만 있음)
  checks: AuditCheck[];
}

/** 스크리밍프로그 크롤 vs 라이브 체크 교차 검증 불일치 */
export interface CrossCheckFlag {
  field: string;
  crawler: string;
  live: string;
  note: string;
}

/** 스크리밍프로그 CSV(Internal All)에서 추출한 사이트 전체 이슈 */
export interface SiteWideIssues {
  totalUrls: number;
  htmlPages: number;
  resources: { images: number; scripts: number; styles: number };
  notFound: string[];
  redirects: { from: string; to: string }[];
  duplicateTitles: { title: string; count: number; urls: string[] }[];
  missingTitle: string[];
  missingMeta: string[];
  missingH1: string[];
  missingCanonical: string[];
  thinContent: { url: string; words: number }[];
  slowPages: { url: string; seconds: number }[];
  deepPages: { url: string; depth: number }[];
}

export interface DiagnosisResult {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  pageTitle: string | null;
  totalScore: number;
  categories: AuditCategory[];
  siteWide: SiteWideIssues | null; // CSV 업로드 시에만
  crossChecks: CrossCheckFlag[];
  /** 실패·경고 체크에서 수집한 견적 품목명 (중복 제거) */
  suggestedItems: string[];
}
