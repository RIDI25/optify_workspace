import path from "node:path";
import {
  Circle,
  Document,
  Font,
  G,
  Line,
  Page,
  Polyline,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { RunBundle } from "@/lib/tracker-server/load-run";
import { pct } from "@/lib/tracker-digest";
import { metricLabel, surfaceLabel } from "@/lib/tracker";

let registered = false;
function ensureFonts() {
  if (registered) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "Pretendard",
    fonts: [
      { src: path.join(dir, "Pretendard-Regular.otf") },
      { src: path.join(dir, "Pretendard-Bold.otf"), fontWeight: "bold" },
    ],
  });
  // 단어는 통째로 줄바꿈한다 (중간에서 끊으면 react-pdf 가 하이픈을 붙여 '한방병-원' 이 된다).
  // 띄어쓰기 없는 아주 긴 덩어리(URL 등)만 글자 단위로 끊어 칸을 넘지 않게 한다.
  Font.registerHyphenationCallback((word) =>
    word.length > 14 ? Array.from(word) : [word],
  );
  registered = true;
}

const ACCENT = "#2563EB";
const DEEP = "#1D4ED8";
const INK = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const TINT = "#EFF6FF";
const SUBTLE = "#F9FAFB";
const SERIES = ["#2563EB", "#0D9488", "#D97706", "#7C3AED"];
/** 표면별 선 색 (주간 추이) */
const PALETTE = [
  "#2563EB",
  "#0D9488",
  "#D97706",
  "#7C3AED",
  "#DB2777",
  "#16A34A",
  "#475569",
  "#B45309",
  "#0891B2",
];
const SURFACE_ORDER = [
  "naver_aib",
  "google_aio",
  "google_aimode",
  "chatgpt",
  "gemini",
  "perplexity",
  "claude",
  "naver_web",
  "google_web",
];
// 좁은 칸용 짧은 표면 이름. 영문+한글이 붙은 한 단어('AI모드')는 좁은 칸에서 'AI-' 로 끊기므로 띄어 쓴 원래 이름을 그대로 둔다.
const SHORT_SURFACE: Record<string, string> = {
  naver_aib: "네이버 AI",
  naver_web: "네이버",
  google_web: "Google",
};
const short = (sf: string) => SHORT_SURFACE[sf] ?? surfaceLabel(sf);
const bySurfaceOrder = (a: string, b: string) => {
  const ia = SURFACE_ORDER.indexOf(a);
  const ib = SURFACE_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
};

// lineHeight 는 부모에서 절대값으로 굳어 내려오므로 글자 크기가 다른 곳은 반드시 다시 준다
const s = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: "Pretendard",
    color: INK,
    fontSize: 9.5,
    lineHeight: 1.45,
  },
  brand: { fontSize: 9, color: MUTED, letterSpacing: 1, lineHeight: 1.4 },
  title: {
    fontSize: 19,
    fontWeight: "bold",
    color: DEEP,
    marginTop: 4,
    marginBottom: 10,
    lineHeight: 1.3,
  },
  bar: { height: 2.5, backgroundColor: ACCENT, marginBottom: 12 },
  meta: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  metaK: {
    width: "22%",
    backgroundColor: SUBTLE,
    padding: 5,
    fontSize: 8.5,
    color: MUTED,
    lineHeight: 1.4,
  },
  metaV: { width: "78%", padding: 5, fontSize: 9, lineHeight: 1.4 },
  h2: {
    fontSize: 12,
    fontWeight: "bold",
    color: DEEP,
    marginTop: 18,
    marginBottom: 6,
    lineHeight: 1.4,
  },
  h3: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: INK,
    marginTop: 8,
    marginBottom: 3,
    lineHeight: 1.4,
  },
  p: { marginBottom: 3 },
  kpis: { flexDirection: "row", gap: 6, marginBottom: 8 },
  kpi: {
    flex: 1,
    backgroundColor: TINT,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 9,
  },
  kpiLabel: { fontSize: 8, color: MUTED, lineHeight: 1.4 },
  kpiValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: INK,
    marginTop: 2,
    lineHeight: 1.3,
  },
  kpiSub: { fontSize: 7.5, color: MUTED, lineHeight: 1.4, marginTop: 1 },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 3 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  th: {
    fontWeight: "bold",
    color: DEEP,
    backgroundColor: TINT,
    paddingVertical: 4,
    paddingHorizontal: 5,
    fontSize: 8,
    lineHeight: 1.35,
  },
  td: {
    paddingVertical: 3.5,
    paddingHorizontal: 5,
    fontSize: 8.5,
    lineHeight: 1.35,
  },
  thCompact: { paddingVertical: 3, paddingHorizontal: 3.5, fontSize: 7.5 },
  tdCompact: { paddingVertical: 3, paddingHorizontal: 3.5, fontSize: 7.8 },
  note: {
    fontSize: 7.5,
    color: MUTED,
    marginTop: 5,
    marginBottom: 2,
    lineHeight: 1.4,
  },
  box: { backgroundColor: SUBTLE, borderRadius: 4, padding: 9, marginTop: 4 },
  bullet: { flexDirection: "row", marginBottom: 2 },
  bulletDot: { width: 10, color: DEEP },
  bulletText: { flex: 1 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    fontSize: 7.5,
    color: MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
    lineHeight: 1.4,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
    marginBottom: 2,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 7.5, color: MUTED, lineHeight: 1.3 },
});

// ── 날짜·주 표기 ────────────────────────────────────────────────
function kst(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : new Date(d.getTime() + 9 * 3_600_000);
}
function fmtDateTime(iso: string | null): string {
  const k = kst(iso);
  if (!k) return "-";
  return `${k.getUTCFullYear()}. ${String(k.getUTCMonth() + 1).padStart(2, "0")}. ${String(k.getUTCDate()).padStart(2, "0")} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}
function fmtDate(iso: string | null): string {
  const k = kst(iso);
  if (!k) return "-";
  return `${k.getUTCFullYear()}. ${String(k.getUTCMonth() + 1).padStart(2, "0")}. ${String(k.getUTCDate()).padStart(2, "0")}`;
}
/** '2026W37' → '9/7~9/13' (그 주 월요일~일요일) */
export function weekLabel(week: string): string {
  const m = week.match(/^(\d{4})W(\d{2})$/);
  if (!m) return week;
  const y = Number(m[1]);
  const w = Number(m[2]);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(
    jan4.getTime() - (dow - 1) * 86_400_000 + (w - 1) * 7 * 86_400_000,
  );
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const f = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `${f(monday)}~${f(sunday)}`;
}

// ── 표 ────────────────────────────────────────────────────────
type Cell = { text: string; bg?: string; color?: string; bold?: boolean };
type Align = "left" | "right" | "center";
/** 머리글 행은 fixed → 표가 다음 쪽으로 이어지면 머리글이 다시 붙는다. 행은 쪼개지 않는다. */
function Table({
  head,
  rows,
  widths,
  align,
  compact,
}: {
  head: string[];
  rows: Cell[][];
  widths: number[];
  align?: Align[];
  compact?: boolean;
}) {
  const th = compact ? [s.th, s.thCompact] : [s.th];
  const td = compact ? [s.td, s.tdCompact] : [s.td];
  return (
    <View style={s.table}>
      <View style={s.tr} fixed>
        {head.map((h, i) => (
          <View
            key={i}
            style={{ width: `${widths[i]}%`, backgroundColor: TINT }}
          >
            <Text style={[...th, { textAlign: align?.[i] ?? "left" }]}>
              {h}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View
          key={ri}
          style={[
            s.tr,
            ri === rows.length - 1 ? { borderBottomWidth: 0 } : {},
            ri % 2 === 1 ? { backgroundColor: SUBTLE } : {},
          ]}
          wrap={false}
        >
          {r.map((c, ci) => (
            <View
              key={ci}
              style={{ width: `${widths[ci]}%`, backgroundColor: c.bg }}
            >
              <Text
                style={[
                  ...td,
                  {
                    textAlign: align?.[ci] ?? "left",
                    color: c.color ?? INK,
                    fontWeight: c.bold ? "bold" : undefined,
                  },
                ]}
              >
                {c.text}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
const T = (text: string | number, extra: Partial<Cell> = {}): Cell => ({
  text: String(text),
  ...extra,
});
const R: Align = "right";

/** 순위 칸 색: 1~3 초록, 4~10 파랑, 11위 밖 회색, 없음 연한 빨강 */
function rankCell(
  best: number | null,
  section: string | null,
  sectionRank: number | null,
  error: string | null,
): Cell {
  if (error) return { text: "측정 오류", bg: "#FEF3C7", color: "#92400E" };
  if (best == null) return { text: "없음", bg: "#FEF2F2", color: "#991B1B" };
  const detail = section
    ? ` (${section}${sectionRank ? ` ${sectionRank}위` : ""})`
    : "";
  if (best <= 3)
    return {
      text: `${best}위${detail}`,
      bg: "#DCFCE7",
      color: "#166534",
      bold: true,
    };
  if (best <= 10)
    return { text: `${best}위${detail}`, bg: "#DBEAFE", color: "#1E40AF" };
  return { text: `${best}위${detail}`, bg: "#F3F4F6", color: "#374151" };
}
/** GEO 칸: 한 줄에 들어가는 짧은 말로. 언급+인용 > 언급 > 인용 > 우리 없음 > 답변 없음 */
function geoCell(
  c:
    | {
        present: number;
        mention: number;
        citation: number;
        error: string | null;
      }
    | undefined,
): Cell {
  if (!c) return { text: "-" };
  if (c.error) return { text: "오류", bg: "#FEF3C7", color: "#92400E" };
  if (!c.present) return { text: "답변 없음", bg: "#F3F4F6", color: "#6B7280" };
  if (c.mention && c.citation)
    return { text: "언급+인용", bg: "#DCFCE7", color: "#166534", bold: true };
  if (c.mention) return { text: "언급", bg: "#DCFCE7", color: "#166534" };
  if (c.citation) return { text: "인용", bg: "#DBEAFE", color: "#1E40AF" };
  return { text: "우리 없음", bg: "#FEF2F2", color: "#991B1B" };
}

// ── 그래프 (SVG) ──────────────────────────────────────────────
const svgText = (
  size: number,
  fill: string,
  anchor: "start" | "middle" | "end",
) => ({ fontSize: size, fill, textAnchor: anchor, fontFamily: "Pretendard" });

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <View style={s.legend}>
      {items.map((it) => (
        <View key={it.name} style={s.legendItem}>
          <View style={[s.legendSwatch, { backgroundColor: it.color }]} />
          <Text style={s.legendText}>{it.name}</Text>
        </View>
      ))}
    </View>
  );
}

/** 묶음 세로 막대 (퍼센트) — 표면별 비율 비교 */
function GroupedBars({
  groups,
  series,
  width = 515,
  height = 170,
}: {
  groups: { label: string; values: (number | null)[] }[];
  series: { name: string; color: string }[];
  width?: number;
  height?: number;
}) {
  const padL = 30;
  const padR = 8;
  const padT = 14;
  const padB = 24;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const gw = plotW / Math.max(1, groups.length);
  const bw = Math.min(26, (gw * 0.7) / Math.max(1, series.length));
  const y = (v: number) => padT + plotH - (v / 100) * plotH;
  return (
    <View>
      <Svg width={width} height={height}>
        {[0, 25, 50, 75, 100].map((v) => (
          <G key={v}>
            <Line
              x1={padL}
              y1={y(v)}
              x2={width - padR}
              y2={y(v)}
              stroke={v === 0 ? "#9CA3AF" : BORDER}
              strokeWidth={0.6}
            />
            <Text x={padL - 4} y={y(v) + 2.5} style={svgText(7, MUTED, "end")}>
              {`${v}%`}
            </Text>
          </G>
        ))}
        {groups.map((g, gi) => {
          const x0 = padL + gi * gw + (gw - bw * series.length) / 2;
          return (
            <G key={gi}>
              {g.values.map((v, si) => {
                const val = v ?? 0;
                const h = (val / 100) * plotH;
                return (
                  <G key={si}>
                    <Rect
                      x={x0 + si * bw + 1}
                      y={y(val)}
                      width={bw - 2}
                      height={h}
                      fill={series[si].color}
                      rx={2}
                    />
                    <Text
                      x={x0 + si * bw + bw / 2}
                      y={y(val) - 3}
                      style={svgText(7, INK, "middle")}
                    >
                      {v == null ? "-" : `${Math.round(val)}%`}
                    </Text>
                  </G>
                );
              })}
              <Text
                x={padL + gi * gw + gw / 2}
                y={height - padB + 11}
                style={svgText(8, INK, "middle")}
              >
                {g.label}
              </Text>
            </G>
          );
        })}
      </Svg>
      <Legend items={series} />
    </View>
  );
}

/** 꺾은선 (퍼센트) — 주간 추이. 값은 0~1 비율. 선 하나 = 표면 하나 */
function LineChartSvg({
  labels,
  series,
  width = 515,
  height = 150,
}: {
  labels: string[];
  series: { name: string; color: string; values: (number | null)[] }[];
  width?: number;
  height?: number;
}) {
  const padL = 32;
  const padR = 30;
  const padT = 12;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = labels.length;
  const x = (i: number) =>
    n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
  const y = (v: number) => padT + plotH - v * plotH;
  const lastIdx = (vals: (number | null)[]) => {
    for (let i = vals.length - 1; i >= 0; i -= 1) if (vals[i] != null) return i;
    return -1;
  };
  // 끝 라벨(마지막 값): 같은 값은 하나로 합치고(검정), 서로 겹치지 않게 최소 7pt 씩 띄운다
  const ends = series
    .map((sr, si) => ({ si, i: lastIdx(sr.values) }))
    .filter((e) => e.i >= 0)
    .map((e) => ({ ...e, v: series[e.si].values[e.i] as number }));
  const groups = new Map<string, { x: number; v: number; sis: number[] }>();
  for (const e of ends) {
    const key = `${e.i}:${Math.round(e.v * 100)}`;
    const g = groups.get(key) ?? { x: x(e.i), v: e.v, sis: [] };
    g.sis.push(e.si);
    groups.set(key, g);
  }
  const endLabels = Array.from(groups.values())
    .sort((a, b) => b.v - a.v)
    .map((g) => ({
      ...g,
      y: y(g.v) + 2.5,
      color: g.sis.length === 1 ? series[g.sis[0]].color : INK,
    }));
  for (let k = 1; k < endLabels.length; k += 1)
    endLabels[k].y = Math.max(endLabels[k].y, endLabels[k - 1].y + 7);
  return (
    <View>
      <Svg width={width} height={height}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <G key={v}>
            <Line
              x1={padL}
              y1={y(v)}
              x2={width - padR}
              y2={y(v)}
              stroke={v === 0 ? "#9CA3AF" : BORDER}
              strokeWidth={0.6}
            />
            <Text x={padL - 4} y={y(v) + 2.5} style={svgText(7, MUTED, "end")}>
              {`${Math.round(v * 100)}%`}
            </Text>
          </G>
        ))}
        {labels.map((l, i) => (
          <Text
            key={i}
            x={x(i)}
            y={height - padB + 11}
            style={svgText(7, INK, "middle")}
          >
            {l}
          </Text>
        ))}
        {series.map((sr, si) => {
          const segs: string[][] = [];
          let cur: string[] = [];
          sr.values.forEach((v, i) => {
            if (v == null) {
              if (cur.length) segs.push(cur);
              cur = [];
            } else cur.push(`${x(i)},${y(v)}`);
          });
          if (cur.length) segs.push(cur);
          return (
            <G key={si}>
              {segs.map((pts, k) => (
                <Polyline
                  key={k}
                  points={pts.join(" ")}
                  fill="none"
                  stroke={sr.color}
                  strokeWidth={1.5}
                />
              ))}
              {sr.values.map((v, i) =>
                v == null ? null : (
                  <Circle key={i} cx={x(i)} cy={y(v)} r={2.2} fill={sr.color} />
                ),
              )}
            </G>
          );
        })}
        {endLabels.map((g, k) => (
          <Text
            key={k}
            x={g.x + 4}
            y={g.y}
            style={svgText(6.5, g.color, "start")}
          >
            {`${Math.round(g.v * 100)}%`}
          </Text>
        ))}
      </Svg>
      <Legend
        items={series.map((sr) => ({ name: sr.name, color: sr.color }))}
      />
    </View>
  );
}

/** 마크다운 추론 → 문단 (## 제목, - 불릿, 번호 목록) */
function InsightBlock({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.replace(/\*\*/g, "").trimEnd());
  return (
    <View>
      {lines.map((l, i) => {
        if (!l.trim()) return <View key={i} style={{ height: 2 }} />;
        if (/^#{1,3} /.test(l))
          return (
            <Text key={i} style={s.h3} minPresenceAhead={40}>
              {l.replace(/^#{1,3} /, "")}
            </Text>
          );
        if (/^[-*] /.test(l))
          return (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.bulletText}>{l.slice(2)}</Text>
            </View>
          );
        const num = l.match(/^(\d+)\. (.*)$/);
        if (num)
          return (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletDot}>{num[1]}.</Text>
              <Text style={s.bulletText}>{num[2]}</Text>
            </View>
          );
        return (
          <Text key={i} style={s.p}>
            {l}
          </Text>
        );
      })}
    </View>
  );
}

function Bul({ children }: { children: string }) {
  return (
    <View style={s.bullet}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
}
/** 절 제목 — 아래 내용이 46pt(표 머리글 + 한 줄 이상)는 같은 쪽에 오도록 (제목만 쪽 끝에 남지 않게) */
function H2({ children }: { children: string }) {
  return (
    <View minPresenceAhead={46}>
      <Text style={s.h2}>{children}</Text>
    </View>
  );
}

/** 고객사 전달용 측정 리포트 (GEO 또는 SEO 한 관점) */
export async function renderTrackerReportPdf(
  b: RunBundle,
  insight: { text: string; created_at: string } | null,
): Promise<Buffer> {
  ensureFonts();
  const d = b.digest;
  const isSeo = d.kind === "seo";
  const scopeLabel = isSeo ? "검색 순위(SEO)" : "AI 노출(GEO)";

  // 주간 추이: 값이 있는 주만 (표면이 달랐던 옛 주는 뺀다). 그래프는 최근 12주, 표는 최근 8주
  const trendMetrics = isSeo
    ? ["rank_found_rate", "rank_top10_rate"]
    : ["exposure_rate", "mention_rate", "citation_rate"];
  const weekRows = b.weekly.filter(
    (w) => trendMetrics.includes(w.metric) && w.value != null,
  );
  const weeks = Array.from(new Set(weekRows.map((w) => w.week)))
    .sort()
    .slice(-12);
  const tableWeeks = weeks.slice(-8);
  const trendSurfaces = Array.from(
    new Set(weekRows.map((w) => w.surface)),
  ).sort(bySurfaceOrder);
  const valueOf = (week: string, surface: string, metric: string) =>
    weekRows.find(
      (w) => w.week === week && w.surface === surface && w.metric === metric,
    )?.value ?? null;

  // 한눈에 보기 문장 (자료에서 바로 계산)
  const highlights: string[] = [];
  if (d.kind === "seo") {
    for (const r of d.surfaces)
      highlights.push(
        `${short(r.surface)}: 검색어 ${r.keywords}개 중 ${r.found}개가 첫 화면에 있고, 그중 10위 안 ${r.top10}개 · 3위 안 ${r.top3}개${r.avgBest != null ? ` (평균 최고 순위 ${r.avgBest.toFixed(1)}위)` : ""}`,
      );
    const none = d.keywords.filter((k) =>
      Object.values(k.cells).every((c) => c.best == null && !c.error),
    );
    if (none.length)
      highlights.push(
        `양쪽 모두 첫 화면에 없는 검색어 ${none.length}개: ${none
          .slice(0, 5)
          .map((k) => k.text)
          .join(", ")}${none.length > 5 ? " 등" : ""}`,
      );
  } else {
    for (const r of d.surfaces)
      highlights.push(
        `${surfaceLabel(r.surface)}: 질문 ${r.observed}개 중 AI 답변 ${r.present}개, 우리 언급 ${r.mention}개 (${pct(r.mentionRate)}), 인용 ${r.citation}개 (${pct(r.citationRate)})`,
      );
    if (d.competitorMentions.length)
      highlights.push(
        `AI 답변에 이름이 나온 경쟁사: ${d.competitorMentions
          .slice(0, 4)
          .map(([n, c]) => `${n} ${c}회`)
          .join(", ")}`,
      );
    if (d.topDomains.length)
      highlights.push(
        `많이 인용된 출처: ${d.topDomains
          .slice(0, 4)
          .map(([n, c]) => `${n} ${c}회`)
          .join(", ")}`,
      );
  }

  const sectionNo = (() => {
    let n = 3;
    return () => String(++n);
  })();

  const doc = (
    <Document
      title={`${b.client.name} ${scopeLabel} 측정 리포트`}
      author="옵티파이"
    >
      <Page size="A4" style={s.page} wrap>
        <Text style={s.brand}>OPTIFY · 검색·AI 노출 측정</Text>
        <Text style={s.title}>
          {b.client.name} {scopeLabel} 측정 리포트
        </Text>
        <View style={s.bar} />
        <View style={s.meta}>
          {[
            ["고객사", b.client.name],
            ["측정 일시", `${fmtDateTime(b.run.started_at)} (한국 시간)`],
            ["측정 표면", b.run.surfaces.map(surfaceLabel).join(", ")],
            [
              "측정 대상",
              isSeo && d.kind === "seo"
                ? `검색어 ${d.totals.keywords}개`
                : d.kind === "geo"
                  ? `질문 ${d.prompts.length}개 (AI 답변 ${d.totals.observed}건)`
                  : "-",
            ],
            ["작성", `${fmtDate(new Date().toISOString())} · 옵티파이`],
          ].map(([k, v], i, arr) => (
            <View
              key={k}
              style={[
                s.metaRow,
                i === arr.length - 1 ? { borderBottomWidth: 0 } : {},
              ]}
            >
              <Text style={s.metaK}>{k}</Text>
              <Text style={s.metaV}>{v}</Text>
            </View>
          ))}
        </View>

        {/* 1. 한눈에 보기 */}
        <H2>1. 한눈에 보기</H2>
        {d.kind === "seo" ? (
          <View style={s.kpis}>
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>측정 검색어</Text>
              <Text style={s.kpiValue}>{d.totals.keywords}개</Text>
              <Text style={s.kpiSub}>표면 {d.surfaces.length}곳에서 측정</Text>
            </View>
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>첫 화면에 있는 경우</Text>
              <Text style={s.kpiValue}>{d.totals.found}건</Text>
              <Text style={s.kpiSub}>
                검색어×표면 {d.totals.keywords * Math.max(1, d.surfaces.length)}
                건 중
              </Text>
            </View>
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>10위 안</Text>
              <Text style={s.kpiValue}>{d.totals.top10}건</Text>
              <Text style={s.kpiSub}>
                첫 화면 중{" "}
                {pct(d.totals.found ? d.totals.top10 / d.totals.found : null)}
              </Text>
            </View>
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>3위 안</Text>
              <Text style={s.kpiValue}>
                {d.surfaces.reduce((a, r) => a + r.top3, 0)}건
              </Text>
              <Text style={s.kpiSub}>
                첫 화면 중{" "}
                {pct(
                  d.totals.found
                    ? d.surfaces.reduce((a, r) => a + r.top3, 0) /
                        d.totals.found
                    : null,
                )}
              </Text>
            </View>
          </View>
        ) : (
          <View style={s.kpis}>
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>AI 답변 관측</Text>
              <Text style={s.kpiValue}>{d.totals.observed}건</Text>
              <Text style={s.kpiSub}>
                {d.totals.errors
                  ? `오류 ${d.totals.errors}건 제외`
                  : `질문 ${d.prompts.length}개 × 표면 ${d.surfaces.length}곳`}
              </Text>
            </View>
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>AI 답변이 뜬 경우</Text>
              <Text style={s.kpiValue}>{d.totals.present}건</Text>
              <Text style={s.kpiSub}>
                관측 중{" "}
                {pct(
                  d.totals.observed
                    ? d.totals.present / d.totals.observed
                    : null,
                )}
              </Text>
            </View>
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>우리를 언급</Text>
              <Text style={s.kpiValue}>{d.totals.mention}건</Text>
              <Text style={s.kpiSub}>
                답변 중{" "}
                {pct(
                  d.totals.present ? d.totals.mention / d.totals.present : null,
                )}
              </Text>
            </View>
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>우리 매체를 인용</Text>
              <Text style={s.kpiValue}>{d.totals.citation}건</Text>
              <Text style={s.kpiSub}>
                답변 중{" "}
                {pct(
                  d.totals.present
                    ? d.totals.citation / d.totals.present
                    : null,
                )}
              </Text>
            </View>
          </View>
        )}
        <View style={s.box} wrap={false}>
          {highlights.map((h, i) => (
            <Bul key={i}>{h}</Bul>
          ))}
        </View>

        {/* 2. 표면별 */}
        <H2>2. 표면별 결과</H2>
        {d.kind === "seo" ? (
          <>
            <View wrap={false}>
              <GroupedBars
                groups={d.surfaces.map((r) => ({
                  label: short(r.surface),
                  values: [
                    r.keywords ? (r.found / r.keywords) * 100 : null,
                    r.keywords ? (r.top10 / r.keywords) * 100 : null,
                    r.keywords ? (r.top3 / r.keywords) * 100 : null,
                  ],
                }))}
                series={[
                  { name: "첫 화면 노출 비율", color: SERIES[0] },
                  { name: "10위 안 비율", color: SERIES[1] },
                  { name: "3위 안 비율", color: SERIES[2] },
                ]}
                height={150}
              />
            </View>
            <Table
              head={[
                "표면",
                "검색어",
                "첫 화면 노출",
                "3위 안",
                "10위 안",
                "평균 최고 순위",
              ]}
              widths={[30, 12, 16, 12, 12, 18]}
              align={["left", R, R, R, R, R]}
              rows={d.surfaces.map((r) => [
                T(surfaceLabel(r.surface), { bold: true }),
                T(r.keywords),
                T(
                  `${r.found}개 (${pct(r.keywords ? r.found / r.keywords : null)})`,
                ),
                T(r.top3),
                T(r.top10),
                T(r.avgBest == null ? "-" : `${r.avgBest.toFixed(1)}위`),
              ])}
            />
          </>
        ) : (
          <>
            <View wrap={false}>
              <GroupedBars
                groups={d.surfaces.map((r) => ({
                  label: short(r.surface),
                  values: [
                    (r.presentRate ?? 0) * 100,
                    r.mentionRate == null ? null : r.mentionRate * 100,
                    r.citationRate == null ? null : r.citationRate * 100,
                  ],
                }))}
                series={[
                  { name: "AI 답변 노출률", color: SERIES[0] },
                  { name: "우리 언급률", color: SERIES[1] },
                  { name: "우리 인용률", color: SERIES[2] },
                ]}
                height={150}
              />
            </View>
            <Table
              head={[
                "표면",
                "관측",
                "답변 노출",
                "언급",
                "인용",
                "노출률",
                "언급률",
                "인용률",
              ]}
              widths={[28, 9, 12, 9, 9, 11, 11, 11]}
              align={["left", R, R, R, R, R, R, R]}
              rows={d.surfaces.map((r) => [
                T(surfaceLabel(r.surface), { bold: true }),
                T(r.observed),
                T(r.present),
                T(r.mention),
                T(r.citation),
                T(pct(r.presentRate)),
                T(pct(r.mentionRate)),
                T(pct(r.citationRate)),
              ])}
            />
          </>
        )}

        {/* 3. 검색어별 / 질문별 */}
        <H2>{isSeo ? "3. 검색어별 순위" : "3. 질문별 결과"}</H2>
        {d.kind === "seo" ? (
          <Table
            head={[
              "검색어",
              "의도",
              ...d.surfaces.map((r) => short(r.surface)),
            ]}
            widths={[
              36,
              12,
              ...d.surfaces.map(() => 52 / Math.max(1, d.surfaces.length)),
            ]}
            rows={d.keywords.map((k) => [
              T(k.text, { bold: true }),
              T(k.intent),
              ...d.surfaces.map((r) =>
                k.cells[r.surface]
                  ? rankCell(
                      k.cells[r.surface].best,
                      k.cells[r.surface].section,
                      k.cells[r.surface].sectionRank,
                      k.cells[r.surface].error,
                    )
                  : T("-"),
              ),
            ])}
          />
        ) : (
          <Table
            compact={d.surfaces.length > 4}
            head={["질문", "의도", ...d.surfaces.map((r) => short(r.surface))]}
            widths={[
              28,
              9,
              ...d.surfaces.map(() => 63 / Math.max(1, d.surfaces.length)),
            ]}
            align={["left", "left", ...d.surfaces.map((): Align => "center")]}
            rows={d.prompts.map((p) => [
              T(p.text, { bold: true }),
              T(p.intent),
              ...d.surfaces.map((r) => geoCell(p.cells[r.surface])),
            ])}
          />
        )}
        <Text style={s.note}>
          {isSeo
            ? "순위는 검색 결과 첫 화면에서 우리 홈페이지·블로그·플레이스가 몇 번째에 보이는지입니다(광고·플레이스 영역 포함). 괄호는 그 영역 안에서의 순서. 초록 = 3위 안, 파랑 = 10위 안, 회색 = 11위 밖, 빨강 = 첫 화면에 없음."
            : "언급 = 답변 본문에 우리 이름이 나옴, 인용 = 답변의 출처에 우리 매체가 있음, 언급+인용 = 둘 다. 우리 없음 = AI 답변은 떴지만 우리가 없음, 답변 없음 = AI 답변 자체가 안 뜸. 같은 질문을 여러 번 물었으면 한 번이라도 있었는지로 표시."}
        </Text>
        {d.kind === "geo" && d.competitorMentions.length > 0 && (
          <Text style={s.note}>
            경쟁사 언급 횟수:{" "}
            {d.competitorMentions.map(([n, c]) => `${n} ${c}회`).join(", ")}
          </Text>
        )}

        {/* 주간 추이 — 지표 하나에 그래프 하나, 선 하나가 표면 하나 */}
        {weeks.length >= 2 ? (
          <>
            <H2>{`${sectionNo()}. 주간 추이`}</H2>
            {trendMetrics.map((m) => (
              <View key={m} wrap={false}>
                <Text style={s.h3}>{metricLabel(m)}</Text>
                <LineChartSvg
                  labels={weeks.map(weekLabel)}
                  series={trendSurfaces.map((sf, i) => ({
                    name: short(sf),
                    color: PALETTE[i % PALETTE.length],
                    values: weeks.map((w) => valueOf(w, sf, m)),
                  }))}
                  height={150}
                />
              </View>
            ))}
            <Table
              compact
              head={["표면 · 지표", ...tableWeeks.map(weekLabel)]}
              widths={[24, ...tableWeeks.map(() => 76 / tableWeeks.length)]}
              align={["left", ...tableWeeks.map(() => R)]}
              rows={trendSurfaces.flatMap((sf) =>
                trendMetrics.map((m) => [
                  T(`${short(sf)} · ${metricLabel(m)}`, { bold: true }),
                  ...tableWeeks.map((w) => T(pct(valueOf(w, sf, m)))),
                ]),
              )}
            />
            <Text style={s.note}>
              주는 월요일~일요일. 같은 조건으로 매주 한 번씩 잰 값이라
              절대값보다 흐름을 봅니다. 빈칸(-)은 그 주에 그 표면을 재지 않은
              것.
            </Text>
          </>
        ) : (
          <View wrap={false}>
            <H2>{`${sectionNo()}. 주간 추이`}</H2>
            <View style={s.box}>
              <Text>
                이번이{" "}
                {weeks.length === 1
                  ? `첫 측정 주(${weekLabel(weeks[0])})`
                  : "첫 측정"}
                입니다. 다음 주부터 같은 조건으로 잰 값이 쌓이면 여기에 꺾은선
                그래프로 흐름이 나타납니다.
              </Text>
            </View>
          </View>
        )}

        <View wrap={false}>
          <H2>{`${sectionNo()}. 지난 측정 대비 변화`}</H2>
          {b.changes.length > 0 ? (
            <View style={s.box}>
              {b.changes.slice(0, 14).map((c, i) => (
                <Bul key={i}>{c}</Bul>
              ))}
              {b.changes.length > 14 && (
                <Text style={s.note}>외 {b.changes.length - 14}건</Text>
              )}
            </View>
          ) : (
            <View style={s.box}>
              <Text>
                {b.prevRun
                  ? "직전 측정과 달라진 항목이 없습니다."
                  : "비교할 직전 측정이 없습니다 (첫 측정)."}
              </Text>
            </View>
          )}
        </View>

        {insight ? (
          <>
            <H2>{`${sectionNo()}. 해석과 다음 조치`}</H2>
            <InsightBlock text={insight.text} />
            <Text style={s.note}>
              작성 {fmtDateTime(insight.created_at)} · 옵티파이 분석 (AI 보조,
              위 표의 숫자만 근거로 작성)
            </Text>
          </>
        ) : (
          <View wrap={false}>
            <H2>{`${sectionNo()}. 해석과 다음 조치`}</H2>
            <View style={s.box}>
              <Text>
                해석이 아직 작성되지 않았습니다. 워크스페이스에서 &apos;추론
                생성&apos;을 누른 뒤 다시 출력하세요.
              </Text>
            </View>
          </View>
        )}

        <View wrap={false}>
          <H2>{`${sectionNo()}. 이 리포트 읽는 법`}</H2>
          <View style={s.box}>
            {isSeo ? (
              <>
                <Bul>
                  표면 = 어디서 검색했는지 (네이버 통합검색, 구글). 모바일 화면
                  기준입니다.
                </Bul>
                <Bul>
                  순위 = 검색 결과 첫 화면에서 우리
                  매체(홈페이지·블로그·플레이스)가 보이는 순서. 광고·플레이스
                  영역도 순서에 넣습니다.
                </Bul>
                <Bul>
                  첫 화면 노출 비율 = 검색어 중 우리 매체가 첫 화면에 있는 비율.
                  10위 안 비율 = 그중 10번째 안에 있는 비율.
                </Bul>
              </>
            ) : (
              <>
                <Bul>
                  표면 = 어느 AI에게 물었는지 (네이버 AI 브리핑, 구글 AI 개요·AI
                  모드, ChatGPT·Gemini·Perplexity·Claude).
                </Bul>
                <Bul>
                  노출률 = 질문에 AI 답변이 뜬 비율. 언급률 = 뜬 답변 중 우리
                  이름이 나온 비율. 인용률 = 뜬 답변 중 출처에 우리 매체가 있는
                  비율.
                </Bul>
                <Bul>
                  AI 답변은 매번 조금씩 달라서 같은 조건으로 매주 재고, 한 번의
                  값보다 흐름을 봅니다.
                </Bul>
              </>
            )}
          </View>
        </View>

        {/* 쪽 번호(render 프롭)는 react-pdf 4.5 + React 19 에서 그려지지 않고 같은 View 의 글자까지 지운다 → 고정 문구만 */}
        <View style={s.footer} fixed>
          <Text>
            옵티파이 · optify.kr · 동일 조건 반복 측정의 추세를 보기 위한
            자료입니다
          </Text>
          <Text>{`${b.client.name} ${scopeLabel} · ${fmtDate(b.run.started_at)}`}</Text>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
