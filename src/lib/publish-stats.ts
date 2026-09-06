/**
 * 콘텐츠 발행 집계의 단일 기준 (리포트·대시보드 공용).
 *
 * - "발행" = published_at 이 있는 것. WP 초안 전송(wp_post_id)만으로는 발행이 아니다 (WP API 는 draft 를 만든다).
 * - 월 귀속은 KST 날짜 기준. 생성량은 created_at, 발행량은 published_at 으로 센다 → 8월 생성·9월 발행은 9월 실적.
 */

export interface PublishRow {
  channel: string;
  wp_post_id: number | null;
  published_at: string | null;
  created_at: string;
}

export interface MonthContentSummary {
  /** 이 달에 생성한 글 수 */
  total: number;
  /** 이 달에 발행 완료로 기록된 글 수 */
  published: number;
  /** 이 달 생성 글의 채널별 수 */
  byChannel: Record<string, number>;
  /** 이 달 발행 글의 채널별 수 */
  publishedByChannel: Record<string, number>;
  /** WP 에 초안만 보내고 아직 발행 표시가 없는 글 (이 달 생성분) */
  wpDrafts: number;
}

/** ISO 시각을 KST 'YYYY-MM' 으로 */
export function kstMonth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const k = new Date(d.getTime() + 9 * 3_600_000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isPublished(row: Pick<PublishRow, "published_at">): boolean {
  return Boolean(row.published_at);
}

export function publishedInMonth(row: Pick<PublishRow, "published_at">, ym: string): boolean {
  return kstMonth(row.published_at) === ym;
}

export function createdInMonth(row: Pick<PublishRow, "created_at">, ym: string): boolean {
  return kstMonth(row.created_at) === ym;
}

/** 한 달치 집계. rows 에는 그 달에 생성됐거나 그 달에 발행된 글이 섞여 있어도 된다. */
export function monthContentSummary(rows: PublishRow[], ym: string): MonthContentSummary {
  const byChannel: Record<string, number> = {};
  const publishedByChannel: Record<string, number> = {};
  let total = 0;
  let published = 0;
  let wpDrafts = 0;
  for (const r of rows) {
    if (createdInMonth(r, ym)) {
      total += 1;
      byChannel[r.channel] = (byChannel[r.channel] ?? 0) + 1;
      if (r.wp_post_id && !r.published_at) wpDrafts += 1;
    }
    if (publishedInMonth(r, ym)) {
      published += 1;
      publishedByChannel[r.channel] = (publishedByChannel[r.channel] ?? 0) + 1;
    }
  }
  return { total, published, byChannel, publishedByChannel, wpDrafts };
}

/** 월의 시작·끝을 KST 기준 UTC ISO 로 (Supabase 조회 조건용) */
export function monthBoundsUtc(ym: string): { startIso: string; endIso: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - 9 * 3_600_000);
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0) - 9 * 3_600_000 - 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
