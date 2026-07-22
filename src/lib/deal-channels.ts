/**
 * 거래 경로 구분 (config 기반).
 * partner: 리드젠랩처럼 외주를 주는 파트너 경유 — 세금계산서 거래처 = 파트너,
 *          실제 고객(엔드 클라이언트)은 별도 라벨(end_client_name)로 구분.
 * referral: 소개 — partner_name에 소개자를 기록.
 */

export type DealChannel = "direct" | "referral" | "partner";

export const DEAL_CHANNELS: { value: DealChannel; label: string }[] = [
  { value: "direct", label: "직접" },
  { value: "referral", label: "소개" },
  { value: "partner", label: "파트너 경유" },
];

export function dealChannelLabel(value: string | null | undefined): string {
  return DEAL_CHANNELS.find((c) => c.value === value)?.label ?? "직접";
}

/** 매출 구성 표시용: 파트너 경유는 파트너명으로, 나머지는 구분 라벨로 묶는다 */
export function dealGroupLabel(
  channel: string | null | undefined,
  partnerName: string | null | undefined,
): string {
  if (channel === "partner") return partnerName?.trim() || "파트너 경유";
  if (channel === "referral") return "소개";
  return "직접";
}
