import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
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
  registered = true;
}

const ACCENT = "#2563EB";
const DEEP = "#1D4ED8";
const INK = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const TINT = "#EFF6FF";

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Pretendard", color: INK, fontSize: 9.5, lineHeight: 1.5 },
  title: { fontSize: 20, fontWeight: "bold", color: DEEP, lineHeight: 1.3, marginBottom: 6 },
  sub: { fontSize: 10, color: MUTED, marginTop: 2 },
  bar: { height: 3, backgroundColor: ACCENT, marginTop: 10, marginBottom: 14 },
  h2: { fontSize: 12, fontWeight: "bold", color: DEEP, marginTop: 14, marginBottom: 6 },
  p: { marginBottom: 4 },
  kpis: { flexDirection: "row", gap: 8, marginBottom: 6 },
  kpi: { flex: 1, backgroundColor: TINT, borderRadius: 4, padding: 8 },
  kpiLabel: { fontSize: 8, color: MUTED },
  kpiValue: { fontSize: 14, fontWeight: "bold", color: INK, marginTop: 2 },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 3, marginBottom: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  th: { fontWeight: "bold", color: DEEP, backgroundColor: TINT, padding: 4, fontSize: 8.5 },
  td: { padding: 4, fontSize: 8.5 },
  note: { fontSize: 8, color: MUTED, marginTop: 4 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: MUTED, textAlign: "center" },
});

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 3_600_000);
  return `${k.getUTCFullYear()}.${String(k.getUTCMonth() + 1).padStart(2, "0")}.${String(k.getUTCDate()).padStart(2, "0")} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

/** 마크다운 추론을 PDF 문단으로: ## 제목 → 굵게, - 불릿 → 들여쓰기 */
function InsightBlock({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trimEnd());
  return (
    <View>
      {lines.map((l, i) => {
        if (!l.trim()) return <View key={i} style={{ height: 3 }} />;
        if (l.startsWith("## ")) return <Text key={i} style={{ fontWeight: "bold", color: DEEP, marginTop: 6, marginBottom: 2 }}>{l.slice(3)}</Text>;
        if (l.startsWith("# ")) return <Text key={i} style={{ fontWeight: "bold", color: DEEP, marginTop: 6, marginBottom: 2 }}>{l.slice(2)}</Text>;
        if (/^[-*] /.test(l)) return <Text key={i} style={{ marginLeft: 8, marginBottom: 1 }}>• {l.slice(2).replace(/\*\*/g, "")}</Text>;
        return <Text key={i} style={s.p}>{l.replace(/\*\*/g, "")}</Text>;
      })}
    </View>
  );
}

function Table({ head, rows, widths }: { head: string[]; rows: (string | number)[][]; widths: number[] }) {
  return (
    <View style={s.table}>
      <View style={s.tr}>
        {head.map((h, i) => (
          <Text key={i} style={[s.th, { width: `${widths[i]}%` }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={[s.tr, ri === rows.length - 1 ? { borderBottomWidth: 0 } : {}]}>
          {r.map((c, ci) => (
            <Text key={ci} style={[s.td, { width: `${widths[ci]}%` }]}>
              {String(c)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** 고객사 전달용 측정 리포트 (GEO 또는 SEO 한 관점, 측정 1건 + 최근 추이 + 추론) */
export async function renderTrackerReportPdf(b: RunBundle, insight: { text: string; created_at: string } | null): Promise<Buffer> {
  ensureFonts();
  const d = b.digest;
  const scopeLabel = b.scope === "geo" ? "AI 노출(GEO)" : "검색 순위(SEO)";
  const weeks = Array.from(new Set(b.weekly.map((w) => w.week))).sort();
  const surfaces = Array.from(new Set(b.weekly.map((w) => w.surface))).sort();
  const metrics = b.scope === "geo" ? ["exposure_rate", "mention_rate", "citation_rate"] : ["rank_found_rate", "rank_top10_rate"];
  const cellOf = (week: string, surface: string, metric: string) => {
    const v = b.weekly.find((w) => w.week === week && w.surface === surface && w.metric === metric)?.value;
    return v == null ? "-" : metric === "rank_avg_best_position" ? v.toFixed(1) : pct(v);
  };

  const doc = (
    <Document title={`${b.client.name} ${scopeLabel} 측정 리포트`} author="옵티파이">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{b.client.name} {scopeLabel} 측정 리포트</Text>
        <Text style={s.sub}>
          측정 {fmtDate(b.run.started_at)} · 표면 {b.run.surfaces.map(surfaceLabel).join(", ")} · 작성 {fmtDate(new Date().toISOString())} · 옵티파이
        </Text>
        <View style={s.bar} />

        <Text style={s.h2}>1. 이번 측정 요약</Text>
        {d.kind === "geo" ? (
          <View style={s.kpis}>
            <View style={s.kpi}><Text style={s.kpiLabel}>AI 관측</Text><Text style={s.kpiValue}>{d.totals.observed}</Text></View>
            <View style={s.kpi}><Text style={s.kpiLabel}>AI 답변 노출</Text><Text style={s.kpiValue}>{d.totals.present}</Text></View>
            <View style={s.kpi}><Text style={s.kpiLabel}>우리 언급</Text><Text style={s.kpiValue}>{d.totals.mention}</Text></View>
            <View style={s.kpi}><Text style={s.kpiLabel}>우리 인용</Text><Text style={s.kpiValue}>{d.totals.citation}</Text></View>
          </View>
        ) : (
          <View style={s.kpis}>
            <View style={s.kpi}><Text style={s.kpiLabel}>검색어</Text><Text style={s.kpiValue}>{d.totals.keywords}</Text></View>
            <View style={s.kpi}><Text style={s.kpiLabel}>첫 화면 노출 (검색어×표면)</Text><Text style={s.kpiValue}>{d.totals.found}</Text></View>
            <View style={s.kpi}><Text style={s.kpiLabel}>10위 안</Text><Text style={s.kpiValue}>{d.totals.top10}</Text></View>
          </View>
        )}
        {d.kind === "geo" ? (
          <Table
            head={["표면", "관측", "노출", "언급", "인용", "노출률", "언급률", "인용률"]}
            widths={[28, 9, 9, 9, 9, 12, 12, 12]}
            rows={d.surfaces.map((r) => [surfaceLabel(r.surface), r.observed, r.present, r.mention, r.citation, pct(r.presentRate), pct(r.mentionRate), pct(r.citationRate)])}
          />
        ) : (
          <Table
            head={["표면", "검색어", "노출", "3위 안", "10위 안", "평균 최고 순위"]}
            widths={[30, 14, 14, 14, 14, 14]}
            rows={d.surfaces.map((r) => [surfaceLabel(r.surface), r.keywords, r.found, r.top3, r.top10, r.avgBest == null ? "-" : `${r.avgBest.toFixed(1)}위`])}
          />
        )}
        <Text style={s.note}>
          {b.scope === "geo"
            ? "노출 = AI 답변 블록이 떴는가 · 언급 = 답변 본문에 우리 이름 · 인용 = 출처에 우리 매체. 비율의 분모는 노출된 관측."
            : "순위 = 검색 결과 화면에 보이는 순서(광고·플레이스 포함). '없음' = 첫 화면에 우리 매체가 없음."}
        </Text>

        <Text style={s.h2}>{d.kind === "geo" ? "2. 질문별 결과" : "2. 검색어별 순위"}</Text>
        {d.kind === "geo" ? (
          <Table
            head={["질문", "의도", ...d.surfaces.map((r) => surfaceLabel(r.surface))]}
            widths={[40, 12, ...d.surfaces.map(() => 48 / Math.max(1, d.surfaces.length))]}
            rows={d.prompts.map((p) => [
              p.text,
              p.intent,
              ...d.surfaces.map((r) => {
                const c = p.cells[r.surface];
                if (!c) return "-";
                if (c.error) return "오류";
                return `${c.present ? "노출" : "미노출"}${c.mention ? "·언급" : ""}${c.citation ? "·인용" : ""}`;
              }),
            ])}
          />
        ) : (
          <Table
            head={["검색어", "의도", ...d.surfaces.map((r) => surfaceLabel(r.surface).replace(" 검색 순위", ""))]}
            widths={[40, 12, ...d.surfaces.map(() => 48 / Math.max(1, d.surfaces.length))]}
            rows={d.keywords.map((k) => [
              k.text,
              k.intent,
              ...d.surfaces.map((r) => {
                const c = k.cells[r.surface];
                if (!c) return "-";
                if (c.error) return "오류";
                return c.best != null ? `${c.best}위 (${c.section ?? ""} ${c.sectionRank ?? ""}위)` : "없음";
              }),
            ])}
          />
        )}
        {d.kind === "geo" && d.competitorMentions.length > 0 && (
          <Text style={s.note}>경쟁사 언급: {d.competitorMentions.map(([n, c]) => `${n} ${c}회`).join(", ")}</Text>
        )}
        {d.kind === "geo" && d.topDomains.length > 0 && <Text style={s.note}>많이 인용된 출처: {d.topDomains.slice(0, 6).map(([n, c]) => `${n} ${c}`).join(", ")}</Text>}

        {b.changes.length > 0 && (
          <>
            <Text style={s.h2}>3. 지난 측정 대비 변화</Text>
            {b.changes.slice(0, 12).map((c, i) => (
              <Text key={i} style={s.p}>• {c}</Text>
            ))}
          </>
        )}

        <Text style={s.footer}>옵티파이 · 이 리포트는 동일 조건 반복 측정의 추세를 보기 위한 자료이며 절대값이 아닙니다.</Text>
      </Page>

      <Page size="A4" style={s.page}>
        {weeks.length > 0 && (
          <>
            <Text style={s.h2}>{b.changes.length > 0 ? "4" : "3"}. 최근 주간 추이 (최대 12주)</Text>
            {surfaces.map((sf) => (
              <View key={sf}>
                <Text style={{ fontWeight: "bold", marginTop: 4, marginBottom: 2 }}>{surfaceLabel(sf)}</Text>
                <Table
                  head={["주", ...metrics.map(metricLabel)]}
                  widths={[28, ...metrics.map(() => 72 / metrics.length)]}
                  rows={weeks.map((w) => [w, ...metrics.map((m) => cellOf(w, sf, m))])}
                />
              </View>
            ))}
          </>
        )}

        <Text style={s.h2}>{weeks.length > 0 ? (b.changes.length > 0 ? "5" : "4") : b.changes.length > 0 ? "4" : "3"}. 해석과 다음 조치</Text>
        {insight ? (
          <>
            <InsightBlock text={insight.text} />
            <Text style={s.note}>작성 {fmtDate(insight.created_at)} · 옵티파이 분석 (AI 보조)</Text>
          </>
        ) : (
          <Text style={s.p}>추론이 아직 없습니다. 화면에서 &apos;추론 생성&apos;을 누른 뒤 다시 출력하세요.</Text>
        )}
        <Text style={s.footer}>옵티파이 · 이 리포트는 동일 조건 반복 측정의 추세를 보기 위한 자료이며 절대값이 아닙니다.</Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
