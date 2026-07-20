/**
 * 견적서 품목 카탈로그 (config 기반 — nav.ts·channels.ts와 동일 패턴).
 * 단가는 견적 작성 시 입력. 카탈로그 수정이 과거 견적에 영향 없음(견적은 jsonb 스냅샷).
 */

export const QUOTE_UNITS = ["식", "페이지", "건", "회", "월", "년"] as const;
export type QuoteUnit = (typeof QUOTE_UNITS)[number];

export interface QuoteCatalogItem {
  name: string;
  /** 견적서 '내역' 컬럼 기본 문구 */
  detail: string;
  unit: QuoteUnit;
}

export interface QuoteCatalogCategory {
  category: string;
  items: QuoteCatalogItem[];
}

export const QUOTE_CATALOG: QuoteCatalogCategory[] = [
  {
    category: "기획·설계",
    items: [
      { name: "사이트 기획·구조 설계", detail: "사이트맵, 키워드 기반 페이지 구조 설계", unit: "식" },
      { name: "디자인 시안", detail: "메인 시안 제작 및 수정", unit: "식" },
    ],
  },
  {
    category: "홈페이지 제작",
    items: [
      { name: "메인 페이지 디자인·제작", detail: "메인 페이지 디자인 및 퍼블리싱", unit: "식" },
      { name: "서브 페이지 제작", detail: "서브 페이지 디자인 및 제작", unit: "페이지" },
      { name: "히든페이지 제작", detail: "검색 유입용 비노출 랜딩 페이지", unit: "페이지" },
      { name: "반응형(모바일) 최적화", detail: "모바일·태블릿 대응", unit: "식" },
      { name: "게시판·블로그 세팅", detail: "게시판/블로그 기능 구축", unit: "식" },
      { name: "상담·예약 문의 폼", detail: "문의 접수 폼 및 알림 연동", unit: "식" },
    ],
  },
  {
    category: "워드프레스 구축",
    items: [
      { name: "워드프레스 설치·기본 세팅", detail: "테마, 필수 플러그인, 보안 설정", unit: "식" },
      { name: "유료 테마·플러그인 라이선스", detail: "라이선스 구매 대행", unit: "건" },
    ],
  },
  {
    category: "SEO 작업",
    items: [
      { name: "스키마 마크업(구조화 데이터)", detail: "LocalBusiness, FAQ, 리뷰 등 구조화 데이터 적용", unit: "식" },
      { name: "검색엔진 등록", detail: "구글 서치콘솔·네이버 서치어드바이저·다음·빙 등록", unit: "식" },
      { name: "사이트맵·robots.txt 세팅", detail: "생성 및 검색엔진 제출", unit: "식" },
      { name: "메타태그 최적화", detail: "전 페이지 타이틀·디스크립션 최적화", unit: "식" },
      { name: "온페이지 SEO", detail: "헤딩 구조·내부링크·이미지 alt 최적화", unit: "식" },
      { name: "페이지 속도 최적화", detail: "Core Web Vitals 개선", unit: "식" },
      { name: "GA4·서치콘솔 연동 세팅", detail: "분석 도구 연동 및 대시보드 세팅", unit: "식" },
      { name: "키워드 리서치", detail: "검색량 기반 타깃 키워드 도출", unit: "식" },
    ],
  },
  {
    category: "GEO·AI 검색",
    items: [
      { name: "GEO 구조 최적화", detail: "AI 검색 인용 대비 콘텐츠 구조화, llms.txt", unit: "식" },
      { name: "AI 노출 진단 리포트", detail: "챗GPT 등 AI 검색 노출 현황 진단", unit: "식" },
    ],
  },
  {
    category: "네이버",
    items: [
      { name: "네이버 플레이스 세팅·최적화", detail: "플레이스 정보 구조 최적화", unit: "식" },
      { name: "네이버 블로그 개설·세팅", detail: "블로그 개설 및 카테고리 체계 세팅", unit: "식" },
    ],
  },
  {
    category: "콘텐츠 제작",
    items: [
      { name: "SEO 콘텐츠 제작", detail: "검색 최적화 콘텐츠 기획·작성", unit: "건" },
      { name: "블로그 원고 작성", detail: "블로그 포스팅 원고", unit: "건" },
    ],
  },
  {
    category: "인프라·기타",
    items: [
      { name: "도메인 등록 대행", detail: "도메인 구매 및 연결", unit: "년" },
      { name: "호스팅 세팅", detail: "호스팅 계정 세팅 및 연결", unit: "식" },
      { name: "SSL 인증서 설치", detail: "보안 인증서 설치", unit: "식" },
      { name: "기존 사이트 이전", detail: "기존 홈페이지 데이터 마이그레이션", unit: "식" },
      { name: "운영 교육·인수인계", detail: "관리자 교육 및 운영 가이드", unit: "회" },
    ],
  },
  {
    category: "유지보수·운영",
    items: [
      { name: "정기 유지보수", detail: "백업·업데이트·보안점검", unit: "월" },
      { name: "검색 노출 관리", detail: "순위 모니터링 및 월간 리포트", unit: "월" },
      { name: "콘텐츠 발행 대행", detail: "콘텐츠 제작·발행 운영 대행", unit: "월" },
    ],
  },
];
