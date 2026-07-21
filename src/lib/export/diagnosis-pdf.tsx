import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { QUOTE_SUPPLIER } from "@/lib/quote-config";
import type { AuditCheck, DiagnosisResult } from "@/lib/seo-audit/types";

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

const DEEP = "#057A4E";
const ACCENT = "#00E87B";
const INK = "#1A2421";
const BORDER = "#c9d2ce";
const TINT = "#EAFBF2";
const RED = "#c0392b";
const AMBER = "#b9770e";

const s = StyleSheet.create({
  page: { padding: 44, fontFamily: "Pretendard", color: INK, fontSize: 9.5 },
  title: { fontSize: 20, fontWeight: "bold", color: DEEP },
  subtitle: { fontSize: 10, color: "#6b7772", marginTop: 4 },
  accentBar: { height: 3, backgroundColor: ACCENT, marginTop: 10, marginBottom: 14 },
  scoreRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  scoreBox: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 3, padding: 8, alignItems: "center" },
  scoreBig: { fontSize: 18, fontWeight: "bold", color: DEEP },
  scoreLabel: { fontSize: 8, color: "#6b7772", marginTop: 2 },
  catTitle: { fontSize: 12, fontWeight: "bold", color: DEEP, marginTop: 12, marginBottom: 5 },
  checkRow: { flexDirection: "row", marginBottom: 3 },
  checkStatus: { width: 40, fontWeight: "bold", fontSize: 8.5 },
  checkLabel: { width: 110, fontWeight: "bold" },
  checkDetail: { flex: 1, color: "#3d5248" },
  sectionTitle: { fontSize: 12, fontWeight: "bold", color: DEEP, marginTop: 14, marginBottom: 5 },
  line: { lineHeight: 1.5, marginBottom: 2 },
  summaryBox: { backgroundColor: TINT, padding: 10, borderRadius: 3, marginTop: 6 },
  footer: { marginTop: 24, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8, fontSize: 8, color: "#6b7772" },
});

const STATUS_LABEL: Record<AuditCheck["status"], { text: string; color: string }> = {
  pass: { text: "양호", color: DEEP },
  warn: { text: "개선", color: AMBER },
  fail: { text: "문제", color: RED },
  info: { text: "참고", color: "#6b7772" },
  skip: { text: "생략", color: "#9aa5a0" },
};

export async function renderDiagnosisPdf(
  result: DiagnosisResult,
  aiSummary: string | null,
  reportDate: string,
): Promise<Buffer> {
  ensureFonts();

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>검색 노출 진단 리포트</Text>
        <Text style={s.subtitle}>
          {result.finalUrl} · 진단일 {reportDate} · {QUOTE_SUPPLIER.name}
          {result.siteWide ? " · 사이트 전체 크롤 + 실시간 교차 검증" : " · 홈 페이지 실시간 진단"}
        </Text>
        <View style={s.accentBar} />

        <View style={s.scoreRow}>
          <View style={[s.scoreBox, { backgroundColor: TINT }]}>
            <Text style={s.scoreBig}>{result.totalScore}</Text>
            <Text style={s.scoreLabel}>종합 점수</Text>
          </View>
          {result.categories.map((cat) => (
            <View key={cat.key} style={s.scoreBox}>
              <Text style={[s.scoreBig, { fontSize: 14, color: (cat.score ?? 100) < 50 ? RED : (cat.score ?? 100) < 80 ? AMBER : DEEP }]}>
                {cat.score ?? "-"}
              </Text>
              <Text style={s.scoreLabel}>{cat.label}</Text>
            </View>
          ))}
        </View>

        {aiSummary && (
          <View style={s.summaryBox} wrap={false}>
            <Text style={{ fontWeight: "bold", color: DEEP, marginBottom: 4 }}>종합 소견</Text>
            {aiSummary.split("\n").filter(Boolean).map((line, i) => (
              <Text key={i} style={s.line}>
                {line}
              </Text>
            ))}
          </View>
        )}

        {result.categories.map((cat) => (
          <View key={cat.key}>
            <Text style={s.catTitle}>
              {cat.label} {cat.score != null ? `— ${cat.score}점` : ""}
            </Text>
            {cat.checks.map((check) => (
              <View key={check.key} style={s.checkRow} wrap={false}>
                <Text style={[s.checkStatus, { color: STATUS_LABEL[check.status].color }]}>
                  {STATUS_LABEL[check.status].text}
                </Text>
                <Text style={s.checkLabel}>{check.label}</Text>
                <Text style={s.checkDetail}>{check.detail}</Text>
              </View>
            ))}
          </View>
        ))}

        {result.crossChecks.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>교차 검증 불일치 (크롤 vs 현재)</Text>
            {result.crossChecks.map((f, i) => (
              <Text key={i} style={s.line}>
                - {f.field}: 크롤 &quot;{f.crawler.slice(0, 50)}&quot; → 현재 &quot;{f.live.slice(0, 50)}&quot;
              </Text>
            ))}
          </View>
        )}

        {result.siteWide && (
          <View>
            <Text style={s.sectionTitle}>사이트 전체 요약 (크롤 데이터)</Text>
            <Text style={s.line}>
              전체 URL {result.siteWide.totalUrls}개 · HTML 페이지 {result.siteWide.htmlPages}개 ·
              이미지 {result.siteWide.resources.images} · 스크립트 {result.siteWide.resources.scripts}
            </Text>
            {result.siteWide.notFound.length > 0 && (
              <Text style={s.line}>- 404 페이지: {result.siteWide.notFound.join(", ").slice(0, 200)}</Text>
            )}
            {result.siteWide.duplicateTitles.slice(0, 5).map((d, i) => (
              <Text key={i} style={s.line}>
                - 중복 타이틀 {d.count}회: {d.title.slice(0, 60)}
              </Text>
            ))}
            {result.siteWide.thinContent.length > 0 && (
              <Text style={s.line}>- 300단어 미만 페이지 {result.siteWide.thinContent.length}개</Text>
            )}
          </View>
        )}

        <View style={s.footer}>
          <Text>
            본 리포트는 {QUOTE_SUPPLIER.name} 진단 엔진의 실시간 측정
            {result.siteWide ? "과 사이트 전체 크롤 데이터의 교차 검증으" : "으"}로 작성되었습니다.
            문의: {QUOTE_SUPPLIER.phone} · {QUOTE_SUPPLIER.email}
          </Text>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
