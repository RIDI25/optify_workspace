/**
 * 브랜드 공통 규칙 — 모든 채널 프롬프트의 시스템 프롬프트 최상위 층에 주입한다.
 * 채널별 프리셋(channel_settings.preset)보다 우선하는 상위 규칙.
 *
 * 2026-09-06(코덱스 09): 옵티파이의 정체성·핵심 메시지는 내부 고객사(옵티파이 자체) 글에만 넣는다.
 * 외부 고객사 글의 화자는 그 고객사이므로 사실성·문장 습관 같은 공통 규칙만 적용한다.
 */

/** 모든 고객사에 적용 — 글쓰기 습관·사실성 */
export const COMMON_RULES: string[] = [
  "수사적 질문으로 긴장을 만들고 스스로 답하는 자문자답 구조를 핵심 수사법으로 사용 — 단, 글 전체에 1~2회만. 섹션마다 반복하면 기계적으로 읽힌다",
  "근거 없는 통계·수치 생성 절대 금지. 확인 불가능하면 쓰지 않는다",
  "CTA는 강매가 아닌 논리(선점효과, 구조적 필요성) 기반으로 부드럽게",
];

/** 옵티파이 자체(내부 고객사) 글에만 적용 — 회사 정체성·핵심 메시지 */
export const OPTIFY_RULES: string[] = [
  "핵심 메시지: '광고가 아니라 구조' — 광고 의존 탈피, 검색 노출 구조 설계가 본질",
  "회사 정체성: 홈페이지·구글 검색·네이버 플레이스와 블로그를 하나의 검색 구조로 통합 설계하는 검색 마케팅 회사",
];

/** 하위 호환: 내부 고객사 기준 전체 규칙 */
export const BRAND_RULES: string[] = [...COMMON_RULES, ...OPTIFY_RULES];

export interface BrandRulesOptions {
  /** 옵티파이 자체 콘텐츠인가 */
  internal: boolean;
  /** 외부 고객사 이름 — 글의 화자 */
  clientName?: string | null;
}

/** 시스템 프롬프트에 넣을 브랜드 규칙 블록. 옵션이 없으면 내부 고객사 기준(하위 호환). */
export function brandRulesBlock(opts: BrandRulesOptions = { internal: true }): string {
  if (opts.internal) {
    return ["[브랜드 공통 규칙]", ...BRAND_RULES.map((r) => `- ${r}`)].join("\n");
  }
  const who = opts.clientName?.trim() ? `'${opts.clientName.trim()}'` : "이 고객사";
  return [
    "[공통 규칙]",
    ...COMMON_RULES.map((r) => `- ${r}`),
    `- 이 글의 화자는 ${who}다. 옵티파이(검색 마케팅 회사)를 언급·홍보하거나 옵티파이의 서비스·메시지를 끼워 넣지 않는다`,
    "- 고객사의 업종·서비스·지역은 주제와 채널 프리셋, 추가 지시에 적힌 정보만 근거로 쓴다. 적히지 않은 사실을 지어내지 않는다",
  ].join("\n");
}

/** 페르소나 첫 줄 — 내부/외부 고객사에 따라 화자를 바꾼다 */
export function writerPersonaLine(opts: BrandRulesOptions, role = "콘텐츠 작가"): string {
  if (opts.internal) {
    return `당신은 옵티파이(검색 마케팅 회사)의 ${role}입니다. 아래 채널 프리셋을 철저히 준수해 글을 작성하세요.`;
  }
  const who = opts.clientName?.trim() ? `'${opts.clientName.trim()}'` : "고객사";
  return `당신은 ${who}의 ${role}입니다 (옵티파이가 대행 작성). 글의 화자와 브랜드는 ${who}이며, 아래 채널 프리셋을 철저히 준수해 글을 작성하세요.`;
}
