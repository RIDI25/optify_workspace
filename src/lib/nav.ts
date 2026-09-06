/**
 * 사이드바 네비게이션 정의 (config 기반). 2026-09-06 개편안 1차: "질문 다섯 개".
 *
 * - 오늘: 지금 무엇을 처리해야 하나 (/)
 * - 고객사: 이 고객의 일이 어디까지 왔나 (/clients → /clients/[id]/[탭])
 * - 영업: 누구에게 어떤 다음 행동을 (/sales, /diagnosis, /quotes)
 * - 정산: 청구했고 들어왔고 남았나 (/revenue, /ledger)
 * - 일정: 언제 무엇이 예정돼 있나 (/schedule, /tasks)
 * - 보조: 설정, 데일리 소식
 *
 * 콘텐츠(키워드·플랜·생성·라이브러리)·SEO·GEO·리포트는 고객사 카드의 탭이다 (CLIENT_TABS).
 * 옛 주소(/plans 등)는 그대로 열리되 지금 고객사의 카드로 안내한다.
 * 2026-09-06 결정: 팀원 2명 모두 같은 권한 → ownerOnly 구분 없음.
 */

export interface NavItem {
  href: string;
  label: string;
  /** 소속 질문(상위 항목)의 href. 없으면 상위 항목 자신 */
  parent?: string;
  /** 항목 앞 아이콘 (이모지) */
  icon?: string;
  /** 보조 메뉴(아래쪽 작은 글씨) */
  aux?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "오늘", icon: "☀️" },
  { href: "/clients", label: "고객사", icon: "🤝" },
  { href: "/sales", label: "영업", icon: "📞" },
  { href: "/diagnosis", label: "SEO 진단", parent: "/sales" },
  { href: "/quotes", label: "견적서 · 계약서", parent: "/sales" },
  { href: "/revenue", label: "정산", icon: "💳" },
  { href: "/ledger", label: "장부", parent: "/revenue" },
  { href: "/schedule", label: "일정", icon: "📅" },
  { href: "/tasks", label: "업무 보드", parent: "/schedule" },
  { href: "/settings", label: "설정 (팀 · 연동 · 사용량)", aux: true },
  { href: "/daily", label: "데일리 소식", aux: true },
];

/** 고객사 카드의 탭. /clients/[id]/[key] */
export interface ClientTab {
  key: "overview" | "content" | "seo" | "geo" | "reports" | "info";
  label: string;
  icon?: string;
}

export const CLIENT_TABS: ClientTab[] = [
  { key: "overview", label: "개요" },
  { key: "content", label: "콘텐츠" },
  { key: "seo", label: "SEO", icon: "🔎" },
  { key: "geo", label: "GEO", icon: "✨" },
  { key: "reports", label: "통합리포트", icon: "📊" },
  { key: "info", label: "기본정보" },
];

export function clientPath(clientId: string, tab: ClientTab["key"] = "overview", query?: string): string {
  return `/clients/${clientId}/${tab}${query ? `?${query}` : ""}`;
}

/** 현재 경로에서 고객사 카드 안인지와 어느 탭인지 */
export function parseClientPath(pathname: string): { clientId: string; tab: ClientTab["key"] | null } | null {
  const m = pathname.match(/^\/clients\/([^/]+)(?:\/([^/?]+))?/);
  if (!m) return null;
  const tab = CLIENT_TABS.find((t) => t.key === m[2])?.key ?? null;
  return { clientId: m[1], tab };
}

/** 옛 주소 → 고객사 카드 탭 (쿼리는 그대로 넘긴다) */
export const LEGACY_ROUTES: Record<string, { tab: ClientTab["key"]; view?: string }> = {
  "/keywords": { tab: "content", view: "keywords" },
  "/plans": { tab: "content", view: "plans" },
  "/generate": { tab: "content", view: "generate" },
  "/library": { tab: "content", view: "library" },
  "/reports": { tab: "reports" },
  "/tracking": { tab: "geo" },
};
