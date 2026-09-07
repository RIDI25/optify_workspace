/**
 * 옵티파이 트래커 표시용 레지스트리·계산 (트래커 console/views/__init__.py, tracker/metrics.py 와 같은 기준).
 * 표면·의도·지표 이름은 트래커가 정한 문자열을 그대로 쓴다. 여기서는 라벨과 포맷만 맡는다.
 */
import type {
  TrackerObservation,
  TrackerWeeklyMetric,
} from "@/types/tracker";

export const SURFACE_LABELS: Record<string, string> = {
  naver_aib: "네이버 AI 브리핑",
  google_aio: "Google AI 개요",
  google_aimode: "Google AI 모드",
  naver_web: "네이버 검색 순위",
  google_web: "Google 검색 순위",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
};

export const INTENT_LABELS: Record<string, string> = {
  all: "전체 (브랜드형 제외)",
  정보형: "정보형",
  지역형: "지역형",
  비교추천형: "비교추천형",
  브랜드형: "브랜드형",
};
export const INTENT_ORDER = ["all", "정보형", "지역형", "비교추천형", "브랜드형"];

export const STATUS_LABELS: Record<string, string> = {
  done: "완료",
  failed: "실패",
  running: "진행 중",
};

export const METRIC_LABELS: Record<string, string> = {
  exposure_rate: "노출률",
  mention_rate: "언급률",
  citation_rate: "인용률",
  sov_mention: "언급 점유율",
  sov_citation: "인용 점유율",
  stable_mention_rate: "안정 언급률",
  avg_mention_order: "평균 언급 순서",
  avg_citation_rank: "평균 인용 순위",
  rank_found_rate: "노출 검색어 비율",
  rank_top3_rate: "3위 안 비율",
  rank_top10_rate: "10위 안 비율",
  rank_avg_best_position: "평균 최고 순위",
};

export const RATE_METRICS = new Set([
  "exposure_rate",
  "mention_rate",
  "citation_rate",
  "sov_mention",
  "sov_citation",
  "stable_mention_rate",
  "rank_found_rate",
  "rank_top3_rate",
  "rank_top10_rate",
]);

export const RANK_SURFACES = new Set(["naver_web", "google_web"]);
export const SUMMARY_METRICS = ["exposure_rate", "mention_rate", "citation_rate", "sov_mention"];
export const CHART_METRICS = [
  "exposure_rate",
  "mention_rate",
  "citation_rate",
  "sov_mention",
  "stable_mention_rate",
];
export const RANK_METRICS = [
  "rank_found_rate",
  "rank_top3_rate",
  "rank_top10_rate",
  "rank_avg_best_position",
];

/** 추세 차트 선 색 (파랑 계열 기본 + 구분색) */
export const CHART_COLORS = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#db2777"];

/** 추세 화면이 불러와 보여 주는 최근 주 수 */
export const TREND_WEEKS = 12;

export function surfaceLabel(s: string): string {
  return SURFACE_LABELS[s] ?? s;
}

export function intentLabel(i: string): string {
  return INTENT_LABELS[i] ?? i;
}

export function metricLabel(m: string): string {
  if (m.startsWith("competitor_mention_rate:")) {
    return "경쟁사 언급률: " + m.slice("competitor_mention_rate:".length);
  }
  return METRIC_LABELS[m] ?? m;
}

export function isRateMetric(m: string): boolean {
  return RATE_METRICS.has(m) || m.startsWith("competitor_mention_rate:");
}

/** 값 표시. 분모 0(값 null)은 '-' — 0 이 아니다. */
export function formatValue(metric: string, value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  if (isRateMetric(metric)) return `${Math.round(value * 100)}%`;
  if (metric === "rank_avg_best_position") return `${value.toFixed(1)}위`;
  return value.toFixed(1);
}

export function pct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

/** '7 / 30' 꼴. 분모가 없으면 '해당 없음'. */
export function fmtRatio(num: number | null | undefined, den: number | null | undefined): string {
  if (den == null || den === 0) return "해당 없음";
  return `${trimNum(num ?? 0)} / ${trimNum(den)}`;
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function shortTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 전주 대비 %p 변화. 둘 중 하나라도 없으면 null. */
export function deltaPoints(cur: number | null | undefined, prev: number | null | undefined): string | null {
  if (cur == null || prev == null) return null;
  const d = Math.round((cur - prev) * 100);
  return `${d > 0 ? "+" : ""}${d}%p`;
}

export function findMetric(
  rows: TrackerWeeklyMetric[],
  week: string,
  surface: string,
  intent: string,
  metric: string,
): TrackerWeeklyMetric | undefined {
  return rows.find(
    (r) => r.week === week && r.surface === surface && r.intent === intent && r.metric === metric,
  );
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort();
}

/** 많이 인용된 도메인 (관측 목록에서 바로 센다) */
export function topDomains(observations: TrackerObservation[], n = 10): [string, number][] {
  const counter = new Map<string, number>();
  for (const o of observations) {
    for (const c of o.citations ?? []) {
      if (!c.domain) continue;
      counter.set(c.domain, (counter.get(c.domain) ?? 0) + 1);
    }
  }
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/** 등록되지 않은 업체명 빈도 (관측 단위로 1회씩 셈) */
export function unlistedEntities(observations: TrackerObservation[], n = 10): [string, number][] {
  const counter = new Map<string, number>();
  for (const o of observations) {
    const seen = new Set<string>();
    for (const e of o.entities ?? []) {
      if (e.matched_to) continue;
      if (seen.has(e.name_norm)) continue;
      seen.add(e.name_norm);
      counter.set(e.name_raw, (counter.get(e.name_raw) ?? 0) + 1);
    }
  }
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/** 주 문자열(ISO 주, 예: 2026-W36) 가운데 최신 n 개를 오름차순으로. 중복은 하나로 센다. */
export function latestWeeks(weeks: Iterable<string>, n = TREND_WEEKS): string[] {
  return uniqueSorted(weeks).slice(-n);
}

/**
 * Supabase(PostgREST) 는 select 한 번을 프로젝트 max-rows(기본 1000)에서 조용히 잘라 버린다.
 * build(from, to) 가 만든 질의에 .range(from, to) 창을 옮겨 가며 한 페이지가 pageSize 보다 적게 올 때까지 모은다.
 * 첫 오류에서 멈추고 그 메시지를 돌려준다 (그때까지 모은 행은 rows 에 남긴다).
 * 창을 옮겨도 행이 겹치거나 빠지지 않도록 build 쪽 정렬은 고유 키까지 포함해야 한다.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) return { rows, error: error.message };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { rows, error: null };
}

/** 어떤 측정(run)이 이 관점(geo/seo)의 결과를 담고 있는지 — 표면 목록으로 판단 */
export function runHasScope(run: { surfaces: string[] }, scope: "geo" | "seo"): boolean {
  const s = run.surfaces ?? [];
  return scope === "seo" ? s.some((x) => RANK_SURFACES.has(x)) : s.some((x) => !RANK_SURFACES.has(x));
}
