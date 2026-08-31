/**
 * 스케줄(일정) 레지스트리 — event_type 표시 메타 + 캘린더 소스별 색.
 * DB(events.event_type)는 text — 하드코딩 enum 금지 원칙.
 */

export interface EventTypeDef {
  key: string;
  label: string;
}

export const EVENT_TYPES: EventTypeDef[] = [
  { key: "meeting", label: "미팅" },
  { key: "deadline", label: "마감" },
  { key: "publish", label: "발행" },
  { key: "etc", label: "기타" },
];

export const eventTypeLabel = (key: string) =>
  EVENT_TYPES.find((t) => t.key === key)?.label ?? key;

/** 캘린더 소스별 칩 색 — 악센트 넓은 면적 금지 원칙에 따라 작은 칩에만 사용 */
export const SOURCE_STYLES: Record<string, string> = {
  event: "bg-tint text-accent-deep",
  task: "bg-blue-50 text-blue-700",
  invoice: "bg-amber-50 text-amber-700",
};

export const SOURCE_LABELS: Record<string, string> = {
  event: "일정",
  task: "업무 마감",
  invoice: "세금계산서",
};
