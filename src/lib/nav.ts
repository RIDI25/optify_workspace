/**
 * 사이드바 네비게이션 정의 (config 기반). 2026-09-06 업무 기준으로 재편.
 *
 * 묶음은 "지금 무슨 일을 하는가" 순서다.
 * - 대시보드
 * - 고객사 업무: 고객사를 고르고 그 고객사의 콘텐츠(1→4)와 성과(추적·월간 리포트)를 본다.
 *   계약 서비스(client_services)에 없는 업무는 흐리게 표시만 한다 — 숨기지 않는다 (기능 변화 없음).
 * - 영업: 리드 → 진단 → 견적. 회계: 매출·장부. 팀: 업무·스케줄·데일리. 관리: 설정.
 */

export type NavGroupKey = "client" | "sales" | "finance" | "team" | "admin";

/** 메뉴 항목이 어떤 계약 서비스와 관련 있는지. content=콘텐츠 채널이 있는 계약, report=기간제 계약 */
export type NavRelevance = "content" | "report";

export interface NavItem {
  href: string;
  label: string;
  /** 소속 묶음. 없으면 맨 위(대시보드) */
  group?: NavGroupKey;
  /** 묶음 안의 작은 소제목 (고객사 업무: 콘텐츠 / 성과) */
  section?: string;
  /** 콘텐츠 워크플로우 단계 번호 (1~5) — 뱃지로 표시 */
  step?: number;
  /** owner 전용 메뉴 여부 */
  ownerOnly?: boolean;
  /** 선택한 고객사 계약과 무관하면 흐리게 */
  relevance?: NavRelevance;
}

export interface NavGroup {
  key: NavGroupKey;
  label: string;
}

export const NAV_GROUPS: NavGroup[] = [
  { key: "client", label: "고객사 업무" },
  { key: "sales", label: "영업" },
  { key: "finance", label: "회계" },
  { key: "team", label: "팀" },
  { key: "admin", label: "관리" },
];

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "대시보드" },

  // 고객사 업무 — 콘텐츠 흐름 1→4, 성과
  { href: "/keywords", label: "키워드 리서치", group: "client", section: "콘텐츠", step: 1, relevance: "content" },
  { href: "/plans", label: "콘텐츠 플랜", group: "client", section: "콘텐츠", step: 2, relevance: "content" },
  { href: "/generate", label: "콘텐츠 생성", group: "client", section: "콘텐츠", step: 3, relevance: "content" },
  { href: "/library", label: "라이브러리 · 발행", group: "client", section: "콘텐츠", step: 4, relevance: "content" },
  { href: "/tracking", label: "AI 노출 · 검색 순위", group: "client", section: "성과" }, // 옵티파이 트래커(맥) 측정 결과 — 모든 고객사
  { href: "/reports", label: "월간 리포트", group: "client", section: "성과", step: 5, relevance: "report" },

  // 영업 — 리드 → 진단 → 견적
  { href: "/sales", label: "리드 · 영업", group: "sales" }, // member는 조회만 (RLS 0023)
  { href: "/diagnosis", label: "SEO 진단", group: "sales", ownerOnly: true },
  { href: "/quotes", label: "견적서 · 계약서", group: "sales", ownerOnly: true },

  // 회계
  { href: "/revenue", label: "매출 · 세금계산서", group: "finance" }, // member는 조회만 (RLS 0023)
  { href: "/ledger", label: "장부", group: "finance" },

  // 팀
  { href: "/tasks", label: "업무", group: "team" },
  { href: "/schedule", label: "스케줄", group: "team" },
  { href: "/daily", label: "데일리 리포트", group: "team" },

  // 관리
  { href: "/settings", label: "설정 (고객사 · 채널 · 팀)", group: "admin" }, // member는 조회만(페이지 내부에서 제어)
];
