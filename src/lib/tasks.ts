/**
 * 업무(태스크) 레지스트리 — status/task_type/priority 표시 메타.
 * DB(tasks.*)는 text — 하드코딩 enum 금지 원칙. 값 추가는 여기 한 줄로 끝.
 */

export interface TaskOptionDef {
  key: string;
  label: string;
  /** 뱃지·칸반 컬럼 헤더용 tailwind 클래스 */
  badge: string;
}

export const TASK_STATUSES: TaskOptionDef[] = [
  { key: "todo", label: "할 일", badge: "bg-subtle text-muted" },
  { key: "in_progress", label: "진행 중", badge: "bg-blue-50 text-blue-700" },
  { key: "review", label: "검토", badge: "bg-amber-50 text-amber-700" },
  { key: "done", label: "완료", badge: "bg-tint text-accent-deep" },
];

export const TASK_TYPES: TaskOptionDef[] = [
  { key: "build", label: "제작", badge: "bg-subtle text-ink" },
  { key: "content", label: "콘텐츠", badge: "bg-subtle text-ink" },
  { key: "admin", label: "서무", badge: "bg-subtle text-ink" },
  { key: "support", label: "응대", badge: "bg-subtle text-ink" },
  { key: "ops", label: "운영", badge: "bg-subtle text-ink" },
];

export const TASK_PRIORITIES: TaskOptionDef[] = [
  { key: "high", label: "높음", badge: "bg-red-50 text-red-600" },
  { key: "normal", label: "보통", badge: "bg-subtle text-muted" },
  { key: "low", label: "낮음", badge: "bg-subtle text-muted" },
];

const find = (defs: TaskOptionDef[], key: string) =>
  defs.find((d) => d.key === key);

export const taskStatusLabel = (key: string) =>
  find(TASK_STATUSES, key)?.label ?? key;
export const taskStatusDef = (key: string) => find(TASK_STATUSES, key);
export const taskTypeLabel = (key: string) =>
  find(TASK_TYPES, key)?.label ?? key;
export const taskPriorityDef = (key: string) => find(TASK_PRIORITIES, key);
