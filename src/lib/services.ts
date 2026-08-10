/**
 * 계약 서비스 레지스트리 (config 기반 — channels.ts와 동일 패턴).
 * 고객사별 계약 항목의 표시 메타. 유형 추가는 여기 한 줄 + 데이터 입력으로 끝.
 * DB(client_services.service_type)는 text — 하드코딩 enum 금지 원칙.
 */

export type ServiceBilling = "one_time" | "period";

export interface ServiceDef {
  key: string;
  label: string;
  emoji: string;
  billing: ServiceBilling;
  /** 기간제 기본 계약 개월 수 */
  defaultMonths?: number;
  /** 이 서비스와 연관된 콘텐츠 채널 (배너·필터 안내용) */
  channels: string[];
  description: string;
}

export const SERVICES: ServiceDef[] = [
  {
    key: "site_build",
    label: "사이트·랜딩페이지 제작",
    emoji: "🏗️",
    billing: "one_time",
    channels: [],
    description: "워드프레스 사이트 또는 랜딩페이지 제작 (일회성)",
  },
  {
    key: "geo_content",
    label: "GEO 콘텐츠 제작",
    emoji: "🔍",
    billing: "period",
    defaultMonths: 6,
    channels: ["wordpress"],
    description: "사이트 GEO/SEO 콘텐츠 제작 (6개월 단위 계약)",
  },
  {
    key: "place_setup",
    label: "네이버 플레이스 세팅",
    emoji: "📍",
    billing: "one_time",
    channels: [],
    description: "네이버 플레이스 구조 세팅 (일회성)",
  },
  {
    key: "naver_manage",
    label: "플레이스·블로그 관리",
    emoji: "📝",
    billing: "period",
    defaultMonths: 6,
    channels: ["naver_blog"],
    description: "네이버 플레이스 및 블로그 콘텐츠 관리 (6개월 단위 계약)",
  },
];

export function getService(key: string): ServiceDef | undefined {
  return SERVICES.find((s) => s.key === key);
}

export function serviceLabel(key: string): string {
  return getService(key)?.label ?? key;
}

export const SERVICE_STATUS_LABELS: Record<string, string> = {
  active: "진행중",
  done: "완료",
  paused: "일시중지",
  ended: "종료",
};

/** 기간제 계약의 남은 일수 (일회성·종료일 없음 = null) */
export function daysUntilEnd(endDate: string | null): number | null {
  if (!endDate) return null;
  const end = new Date(`${endDate}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - now.getTime()) / 86_400_000);
}
