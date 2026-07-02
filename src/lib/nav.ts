/** 사이드바 네비게이션 정의 (config 기반) */

export interface NavItem {
  href: string;
  label: string;
  /** owner 전용 메뉴 여부 */
  ownerOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "대시보드" },
  { href: "/generate", label: "콘텐츠 생성" },
  { href: "/keywords", label: "키워드 리서치" },
  { href: "/plans", label: "콘텐츠 플랜" },
  { href: "/library", label: "라이브러리" },
  { href: "/reports", label: "리포트" },
  { href: "/settings", label: "설정", ownerOnly: false }, // member는 조회만(페이지 내부에서 제어)
];
