/** 온보딩 기본 태스크 정의 + 자동완료 감지 키 */

export interface OnboardingTaskDef {
  key: string;
  label: string;
  /** 시스템이 자동 감지 가능한 항목 */
  auto?: boolean;
}

export const DEFAULT_ONBOARDING_TASKS: OnboardingTaskDef[] = [
  { key: "gsc_service_account", label: "GSC에 서비스 계정 이메일 추가 요청" },
  { key: "ga4_service_account", label: "GA4에 서비스 계정 추가 요청" },
  { key: "gsc_ga4_ids", label: "GSC 사이트 URL·GA4 속성 ID 입력", auto: true },
  { key: "wp_connection", label: "WP Application Password 입력·연결", auto: true },
  { key: "channel_presets", label: "채널 프리셋 정의", auto: true },
  { key: "first_keyword_research", label: "첫 키워드 리서치", auto: true },
];

export interface AutoSignals {
  hasGscGa4Ids: boolean;
  hasWpCreds: boolean;
  hasPresets: boolean;
  hasKeywords: boolean;
}

/** 신호로부터 자동완료로 볼 task_key 집합 */
export function autoDoneKeys(s: AutoSignals): Set<string> {
  const keys = new Set<string>();
  if (s.hasGscGa4Ids) keys.add("gsc_ga4_ids");
  if (s.hasWpCreds) keys.add("wp_connection");
  if (s.hasPresets) keys.add("channel_presets");
  if (s.hasKeywords) keys.add("first_keyword_research");
  return keys;
}
