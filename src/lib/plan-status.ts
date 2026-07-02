import type { PlanStatus } from "@/types/database";

export const PLAN_STATUSES: { key: PlanStatus; label: string }[] = [
  { key: "idea", label: "아이디어" },
  { key: "writing", label: "작성 중" },
  { key: "review", label: "검토" },
  { key: "published", label: "발행됨" },
];

export function planStatusLabel(status: string): string {
  return PLAN_STATUSES.find((s) => s.key === status)?.label ?? status;
}
