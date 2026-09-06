/**
 * 사이드바 네비게이션 정의 (config 기반). 2026-09-06 재편.
 *
 * 왼쪽 메뉴는 두 블록으로 나뉜다.
 * - 옵티파이 내부 업무: 대시보드 · 영업 · 회계 · 팀 · 관리 — 고객사와 무관한 우리 일
 * - 고객사 업무: 고객사를 고른 뒤 그 고객사의 콘텐츠(접이식) · SEO · GEO · 통합리포트
 *   계약 서비스(client_services)에 없는 업무는 흐리게 표시만 한다 — 숨기지 않는다 (기능 변화 없음).
 *
 * href 에 쿼리가 붙은 항목(예: /tracking?view=seo)은 같은 화면을 다른 관점으로 여는 것이다.
 */

export type NavBlockKey = "internal" | "client";

/** 메뉴 항목이 어떤 계약 서비스와 관련 있는지. content=콘텐츠 채널이 있는 계약, report=기간제 계약 */
export type NavRelevance = "content" | "report";

export interface NavItem {
  href: string;
  label: string;
  block: NavBlockKey;
  /** 블록 안의 소제목 (내부: 영업/회계/팀/관리, 고객사: 콘텐츠) */
  section?: string;
  /** 콘텐츠 워크플로우 단계 번호 (1~4) — 뱃지로 표시 */
  step?: number;
  /** 항목 앞 아이콘 (이모지) */
  icon?: string;
  /** owner 전용 메뉴 여부 */
  ownerOnly?: boolean;
  /** 선택한 고객사 계약과 무관하면 흐리게 */
  relevance?: NavRelevance;
}

export interface NavBlock {
  key: NavBlockKey;
  label: string;
  icon: string;
}

export const NAV_BLOCKS: NavBlock[] = [
  { key: "internal", label: "옵티파이 내부 업무", icon: "🏢" },
  { key: "client", label: "고객사 업무", icon: "🤝" },
];

/** 접었다 폈다 할 수 있는 소제목 */
export const COLLAPSIBLE_SECTIONS = ["콘텐츠"];

/** 쿼리가 없는 주소가 뜻하는 기본 관점 (활성 표시 판단용) */
export const DEFAULT_QUERY: Record<string, string> = { view: "geo" };

export const NAV_ITEMS: NavItem[] = [
  // ── 옵티파이 내부 업무 ─────────────────────────────────────
  { href: "/", label: "대시보드", block: "internal", icon: "🏠" },
  { href: "/sales", label: "리드 · 영업", block: "internal", section: "영업" }, // member는 조회만 (RLS 0023)
  { href: "/diagnosis", label: "SEO 진단", block: "internal", section: "영업", ownerOnly: true },
  { href: "/quotes", label: "견적서 · 계약서", block: "internal", section: "영업", ownerOnly: true },
  { href: "/revenue", label: "매출 · 세금계산서", block: "internal", section: "회계" }, // member는 조회만 (RLS 0023)
  { href: "/ledger", label: "장부", block: "internal", section: "회계" },
  { href: "/tasks", label: "업무", block: "internal", section: "팀" },
  { href: "/schedule", label: "스케줄", block: "internal", section: "팀" },
  { href: "/daily", label: "데일리 리포트", block: "internal", section: "팀" },
  { href: "/settings", label: "설정 (고객사 · 채널 · 팀)", block: "internal", section: "관리" }, // member는 조회만

  // ── 고객사 업무 ───────────────────────────────────────────
  { href: "/keywords", label: "키워드 리서치", block: "client", section: "콘텐츠", step: 1, relevance: "content" },
  { href: "/plans", label: "콘텐츠 플랜", block: "client", section: "콘텐츠", step: 2, relevance: "content" },
  { href: "/generate", label: "콘텐츠 생성", block: "client", section: "콘텐츠", step: 3, relevance: "content" },
  { href: "/library", label: "라이브러리 · 발행", block: "client", section: "콘텐츠", step: 4, relevance: "content" },
  { href: "/tracking?view=seo", label: "SEO", block: "client", icon: "🔎" }, // 검색 순위 (옵티파이 트래커)
  { href: "/tracking?view=geo", label: "GEO", block: "client", icon: "✨" }, // AI 노출 (옵티파이 트래커)
  { href: "/reports", label: "통합리포트", block: "client", icon: "📊", relevance: "report" }, // 월간 리포트 (GSC·GA4·네이버·콘텐츠)
];
