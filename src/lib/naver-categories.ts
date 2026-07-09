/**
 * 옵티파이 네이버 블로그 카테고리 체계 (docs/옵티파이-사업-컨텍스트.txt §3 기준).
 * 생성 시 카테고리 특성에 맞는 각도를 프롬프트에 주입하고,
 * 결과에 "카테고리 - ○○○" 표시를 하기 위한 레지스트리.
 */
export interface NaverCategoryDef {
  key: string;
  label: string;
  /** 카테고리의 역할·글 각도 (프롬프트 주입용) */
  guide: string;
  /** AI 작성 가능 여부 — '옵티파이 안내'는 대표 직접 작성 영역 */
  aiWritable: boolean;
}

export const NAVER_CATEGORIES: NaverCategoryDef[] = [
  {
    key: "optify_intro",
    label: "옵티파이 안내",
    guide: "회사·서비스·진단 안내 (대표 직접 작성 — AI 작성 금지)",
    aiWritable: false,
  },
  {
    key: "biz_homepage",
    label: "사업자 홈페이지 제작",
    guide: "홈페이지 제작·비용·구조 관련. 저가/고가 함정보다 '무엇이 포함되는가'로 판단하게 하는 각도",
    aiWritable: true,
  },
  {
    key: "google_ai",
    label: "구글 / AI 검색",
    guide: "구글 SEO·GEO·AEO·AI 노출의 개념과 원리를 사업자 눈높이로. 'SEO가 기반, GEO는 그 위에 얹는 것' 순서 준수",
    aiWritable: true,
  },
  {
    key: "naver_place",
    label: "네이버 검색 / 플레이스",
    guide: "네이버 채널 관련 + 채널 통합 관점. 네이버를 깎아내리지 않고 구글과 둘 다 잡아야 한다는 결론 유지",
    aiWritable: true,
  },
  {
    key: "industry",
    label: "업종별 마케팅",
    guide: "업종 특화 글 (현재 보류 — 반드시 대표 승인 후 작성). 의료광고법 등 컴플라이언스 최우선",
    aiWritable: true,
  },
  {
    key: "diagnosis_guide",
    label: "마케팅 진단 / 가이드",
    guide: "점검법·선택 기준·체크리스트. '추천'이 아니라 '선택 기준' 각도, 타 업체 저격 금지",
    aiWritable: true,
  },
];

export function getNaverCategory(key: string): NaverCategoryDef | undefined {
  return NAVER_CATEGORIES.find((c) => c.key === key);
}

/** 모델이 출력한 카테고리명(콤마/슬래시·공백 변형 허용)을 레지스트리와 매칭 */
export function matchNaverCategoryByLabel(
  label: string,
): NaverCategoryDef | undefined {
  const norm = (s: string) => s.replace(/[\s,/·]+/g, "");
  return NAVER_CATEGORIES.find((c) => norm(c.label) === norm(label));
}

/** 자동 선택 시 모델이 본문 끝에 출력하는 마커: [카테고리: ○○○] */
export const NAVER_CATEGORY_MARKER_RE =
  /\n?\s*\[카테고리[:：]\s*([^\]]+)\]\s*$/;

/** 네이버 블로그 생성 시스템 프롬프트에 넣을 카테고리 블록 */
export function naverCategoryPromptBlock(categoryKey?: string | null): string {
  const lines = [
    "[네이버 블로그 카테고리 체계]",
    ...NAVER_CATEGORIES.map(
      (c) => `  - ${c.label}: ${c.guide}`,
    ),
  ];
  const chosen =
    categoryKey && categoryKey !== "auto" ? getNaverCategory(categoryKey) : null;
  if (chosen) {
    lines.push(
      "",
      `이 글은 '${chosen.label}' 카테고리에 발행됩니다. 해당 카테고리의 역할과 각도에 맞게 작성하세요.`,
    );
  } else {
    lines.push(
      "",
      "이 글에 가장 적합한 카테고리를 위 체계에서 선택해('옵티파이 안내'는 제외) 그 특성에 맞게 작성하세요.",
      "본문을 모두 쓴 뒤, 맨 마지막에 별도 줄로 정확히 `[카테고리: 카테고리명]` 한 줄을 출력하세요. 이 줄은 시스템이 분리하므로 발행 본문에는 포함되지 않습니다.",
    );
  }
  return lines.join("\n");
}
