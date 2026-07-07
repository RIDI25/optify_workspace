/** 사이드바 네비게이션 정의 (config 기반) */

export interface NavItem {
  href: string;
  label: string;
  /** 콘텐츠 워크플로우 단계 번호 (1~5) — 사이드바에 뱃지로 표시 */
  step?: number;
  /** 이 항목 위에 표시할 섹션 캡션 */
  section?: string;
  /** owner 전용 메뉴 여부 */
  ownerOnly?: boolean;
}

/** 메뉴는 실제 업무 흐름 순서: 발굴 → 기획 → 생성 → 검수·발행 → 성과 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "대시보드" },
  { href: "/keywords", label: "키워드 리서치", step: 1, section: "콘텐츠 워크플로우" },
  { href: "/plans", label: "콘텐츠 플랜", step: 2 },
  { href: "/generate", label: "콘텐츠 생성", step: 3 },
  { href: "/library", label: "라이브러리", step: 4 },
  { href: "/reports", label: "리포트", step: 5 },
  { href: "/settings", label: "설정", section: "관리", ownerOnly: false }, // member는 조회만(페이지 내부에서 제어)
];
