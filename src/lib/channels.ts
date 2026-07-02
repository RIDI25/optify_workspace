/**
 * 채널 레지스트리 (설계 원칙 #3).
 *
 * channel 값은 DB에 string으로 저장되며 enum이 아니다. 이 레지스트리는 UI 표시용
 * 메타데이터(라벨·색상·유형)일 뿐, 새 채널 추가는 여기에 항목을 더하거나 DB에
 * channel_settings 행을 추가하는 것으로 충분하다. 코드 곳곳의 하드코딩을 피한다.
 *
 * 추후 예정: 'naver_place' (플레이스 세팅 체크리스트, 리뷰 답변 생성).
 */

export interface ChannelDef {
  /** DB에 저장되는 채널 키 */
  key: string;
  label: string;
  /** 사이드바·캘린더 색상 구분용 */
  color: string;
  /** 스레드처럼 content_type(유형) 선택이 필요한 채널인지 */
  hasContentTypes: boolean;
}

export const CHANNELS: ChannelDef[] = [
  { key: "naver_blog", label: "네이버 블로그", color: "#03C75A", hasContentTypes: false },
  { key: "wordpress", label: "워드프레스", color: "#21759B", hasContentTypes: false },
  { key: "threads", label: "스레드", color: "#1A2421", hasContentTypes: true },
];

/** 스레드 등 유형 기반 채널의 content_type 목록 (structure_templates 키와 일치) */
export const THREADS_CONTENT_TYPES: { key: string; label: string }[] = [
  { key: "news_commentary", label: "뉴스 해설" },
  { key: "motivation", label: "동기부여" },
  { key: "personal_story", label: "개인 서사" },
  { key: "promo_cta", label: "홍보/CTA" },
  { key: "trust_case", label: "실적/신뢰" },
  { key: "self_deprecating", label: "자기 지목 유머" },
];

export function getChannel(key: string): ChannelDef | undefined {
  return CHANNELS.find((c) => c.key === key);
}

export function channelLabel(key: string): string {
  return getChannel(key)?.label ?? key;
}
