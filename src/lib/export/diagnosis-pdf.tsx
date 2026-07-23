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
import { CATEGORY_GUIDE, CHECK_GUIDE, scoreGrade } from "@/lib/seo-audit/check-guide";
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
const MUTED = "#6b7772";
const BORDER = "#c9d2ce";
const TINT = "#EAFBF2";
const SUBTLE = "#f5f7f6";
const RED = "#c0392b";
const AMBER = "#b9770e";

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Pretendard", color: INK, fontSize: 9.5 },
  // ── 표지 ──
  cover: { padding: 0, fontFamily: "Pretendard", color: INK },
  coverTopBar: { height: 10, backgroundColor: ACCENT },
  coverBody: { flex: 1, paddingHorizontal: 56, paddingVertical: 48 },
  coverBrandRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  coverBrandDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: ACCENT },
  coverBrandName: { fontSize: 13, fontWeight: "bold", letterSpacing: 1 },
  coverCenter: { flex: 1, justifyContent: "center" },
  coverKicker: { fontSize: 11, color: DEEP, fontWeight: "bold", letterSpacing: 3, marginBottom: 10 },
  coverTitle: { fontSize: 30, fontWeight: "bold", lineHeight: 1.25 },
  coverSite: { fontSize: 13, color: MUTED, marginTop: 14 },
  coverScoreRow: { flexDirection: "row", alignItems: "center", gap: 28, marginTop: 36 },
  coverScoreCircle: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 5,
    borderColor: DEEP,
    backgroundColor: TINT,
    alignItems: "center",
    justifyContent: "center",
  },
  coverScoreNum: { fontSize: 38, fontWeight: "bold", color: DEEP },
  coverScoreUnit: { fontSize: 9, color: MUTED, marginTop: 1 },
  coverGrade: { fontSize: 15, fontWeight: "bold" },
  coverGradeDesc: { fontSize: 10, color: MUTED, marginTop: 5, lineHeight: 1.6, maxWidth: 250 },
  coverMetaBox: { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 14, marginTop: 36 },
  coverMetaRow: { flexDirection: "row", marginBottom: 4 },
  coverMetaLabel: { width: 76, color: MUTED, fontSize: 9.5 },
  coverMetaValue: { fontSize: 9.5, flex: 1 },
  coverFooter: {
    backgroundColor: SUBTLE,
    paddingHorizontal: 56,
    paddingVertical: 16,
  },
  coverFooterText: { fontSize: 8.5, color: MUTED, lineHeight: 1.6 },
  // ── 공통 ──
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  pageHeaderBrand: { fontSize: 8.5, color: MUTED },
  accentBar: { height: 2.5, backgroundColor: ACCENT, marginBottom: 16 },
  h2: { fontSize: 15, fontWeight: "bold", color: DEEP, marginBottom: 10 },
  h3: { fontSize: 12, fontWeight: "bold", color: INK },
  bodyText: { lineHeight: 1.6, color: INK },
  mutedText: { lineHeight: 1.6, color: MUTED },
  // 요약
  summaryChipRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  summaryChip: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 9, alignItems: "center" },
  chipNum: { fontSize: 17, fontWeight: "bold" },
  chipLabel: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  barLabel: { width: 105, fontSize: 9.5 },
  barTrack: { flex: 1, height: 9, backgroundColor: SUBTLE, borderRadius: 5, overflow: "hidden" },
  barFill: { height: 9, borderRadius: 5 },
  barScore: { width: 40, textAlign: "right", fontWeight: "bold", fontSize: 9.5 },
  aiBox: { backgroundColor: TINT, borderRadius: 4, padding: 12, marginTop: 12 },
  methodBox: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 11, marginTop: 12 },
  // 상세
  catBlock: { marginBottom: 14 },
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1.5,
    borderBottomColor: DEEP,
    paddingBottom: 4,
    marginBottom: 6,
  },
  catScore: { fontSize: 12, fontWeight: "bold", color: DEEP },
  catGuide: { fontSize: 9, color: MUTED, lineHeight: 1.55, marginBottom: 8 },
  checkCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 8,
    marginBottom: 5,
  },
  checkTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  badge: {
    width: 34,
    borderRadius: 3,
    paddingVertical: 2,
    textAlign: "center",
    fontSize: 8,
    fontWeight: "bold",
    color: "#ffffff",
  },
  checkLabel: { fontWeight: "bold", fontSize: 10 },
  checkDetail: { fontSize: 9.5, lineHeight: 1.5, marginBottom: 2 },
  checkGuide: { fontSize: 8.5, color: MUTED, lineHeight: 1.5 },
  // 사이트 전체
  tableHead: { flexDirection: "row", backgroundColor: TINT, borderWidth: 1, borderColor: BORDER },
  tableRow: { flexDirection: "row", borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 },
  th: { padding: 5, fontWeight: "bold", color: DEEP, fontSize: 8.5 },
  td: { padding: 5, fontSize: 8.5 },
  // 개선 제안
  prioItem: { flexDirection: "row", gap: 8, marginBottom: 7 },
  prioNum: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: DEEP,
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "center",
    paddingTop: 2.5,
  },
  ctaBox: { backgroundColor: TINT, borderRadius: 4, padding: 14, marginTop: 18 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: MUTED,
  },
});

const STATUS_META: Record<AuditCheck["status"], { text: string; color: string }> = {
  pass: { text: "양호", color: DEEP },
  warn: { text: "개선", color: AMBER },
  fail: { text: "문제", color: RED },
  info: { text: "참고", color: MUTED },
  skip: { text: "생략", color: "#9aa5a0" },
};

const scoreColor = (score: number | null) =>
  score == null ? MUTED : score < 50 ? RED : score < 80 ? AMBER : DEEP;

function PageChrome({ host, page }: { host: string; page: string }) {
  return (
    <>
      <View style={s.pageHeader} fixed>
        <Text style={s.pageHeaderBrand}>검색 노출 진단 리포트 — {host}</Text>
        <Text style={s.pageHeaderBrand}>{QUOTE_SUPPLIER.name}</Text>
      </View>
      <View style={s.accentBar} fixed />
      <View style={s.footer} fixed>
        <Text>
          © {QUOTE_SUPPLIER.name} · {QUOTE_SUPPLIER.website}
        </Text>
        <Text>{page}</Text>
      </View>
    </>
  );
}

export async function renderDiagnosisPdf(
  result: DiagnosisResult,
  aiSummary: string | null,
  reportDate: string,
): Promise<Buffer> {
  ensureFonts();
  const host = new URL(result.finalUrl).hostname;
  const { grade, label: gradeLabel } = scoreGrade(result.totalScore);

  const allChecks = result.categories.flatMap((cat) => cat.checks);
  const counts = {
    fail: allChecks.filter((x) => x.status === "fail").length,
    warn: allChecks.filter((x) => x.status === "warn").length,
    pass: allChecks.filter((x) => x.status === "pass").length,
  };
  const priorities = [
    ...allChecks.filter((x) => x.status === "fail"),
    ...allChecks.filter((x) => x.status === "warn"),
  ].slice(0, 8);

  const gradeDesc =
    grade === "A"
      ? "검색 노출 기반이 잘 갖춰져 있습니다. 세부 항목을 다듬으면 더 안정적인 상위 노출을 기대할 수 있습니다."
      : grade === "B"
        ? "기본기는 갖췄지만 검색 성과를 깎는 요소들이 남아 있습니다. 아래 개선 항목을 처리하면 노출 개선 여지가 큽니다."
        : grade === "C"
          ? "검색엔진이 사이트를 제대로 평가하기 어려운 상태입니다. 우선순위 항목부터 순서대로 개선이 필요합니다."
          : "검색 노출의 기본 조건이 상당 부분 빠져 있습니다. 구조 개선 없이는 검색·AI 노출을 기대하기 어렵습니다.";

  const doc = (
    <Document>
      {/* ── 1. 표지 ── */}
      <Page size="A4" style={s.cover}>
        <View style={s.coverTopBar} />
        <View style={s.coverBody}>
          <View style={s.coverBrandRow}>
            <View style={s.coverBrandDot} />
            <Text style={s.coverBrandName}>OPTIFY</Text>
          </View>

          <View style={s.coverCenter}>
            <Text style={s.coverKicker}>SEARCH VISIBILITY REPORT</Text>
            <Text style={s.coverTitle}>검색 노출{"\n"}진단 리포트</Text>
            <Text style={s.coverSite}>
              {result.pageTitle ? `${result.pageTitle}\n` : ""}
              {result.finalUrl}
            </Text>

            <View style={s.coverScoreRow}>
              <View style={s.coverScoreCircle}>
                <Text style={s.coverScoreNum}>{result.totalScore}</Text>
                <Text style={s.coverScoreUnit}>종합 점수 / 100</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.coverGrade, { color: scoreColor(result.totalScore) }]}>
                  등급 {grade} · {gradeLabel}
                </Text>
                <Text style={s.coverGradeDesc}>{gradeDesc}</Text>
              </View>
            </View>
          </View>

          <View style={s.coverMetaBox}>
            <View style={s.coverMetaRow}>
              <Text style={s.coverMetaLabel}>진단일</Text>
              <Text style={s.coverMetaValue}>{reportDate}</Text>
            </View>
            <View style={s.coverMetaRow}>
              <Text style={s.coverMetaLabel}>진단 범위</Text>
              <Text style={s.coverMetaValue}>
                {result.siteWide
                  ? `사이트 전체 크롤 (HTML ${result.siteWide.htmlPages}페이지 · 전체 ${result.siteWide.totalUrls}개 URL) + 실시간 측정 교차 검증`
                  : "대표 페이지 실시간 측정 (라이트 진단)"}
              </Text>
            </View>
            <View style={s.coverMetaRow}>
              <Text style={s.coverMetaLabel}>진단 기관</Text>
              <Text style={s.coverMetaValue}>
                {QUOTE_SUPPLIER.name} · {QUOTE_SUPPLIER.address}
              </Text>
            </View>
          </View>
        </View>
        <View style={s.coverFooter}>
          <Text style={s.coverFooterText}>
            본 리포트는 실측 데이터에 근거해 작성되었으며, 수신자의 검토 목적으로 제공됩니다.
            문의: {QUOTE_SUPPLIER.phone} · {QUOTE_SUPPLIER.email}
          </Text>
        </View>
      </Page>

      {/* ── 2. 진단 요약 ── */}
      <Page size="A4" style={s.page}>
        <PageChrome host={host} page="진단 요약" />
        <Text style={s.h2}>진단 요약</Text>

        <View style={s.summaryChipRow}>
          <View style={[s.summaryChip, { backgroundColor: TINT }]}>
            <Text style={[s.chipNum, { color: scoreColor(result.totalScore) }]}>
              {result.totalScore}점
            </Text>
            <Text style={s.chipLabel}>종합 (등급 {grade})</Text>
          </View>
          <View style={s.summaryChip}>
            <Text style={[s.chipNum, { color: RED }]}>{counts.fail}</Text>
            <Text style={s.chipLabel}>문제 항목</Text>
          </View>
          <View style={s.summaryChip}>
            <Text style={[s.chipNum, { color: AMBER }]}>{counts.warn}</Text>
            <Text style={s.chipLabel}>개선 권장</Text>
          </View>
          <View style={s.summaryChip}>
            <Text style={[s.chipNum, { color: DEEP }]}>{counts.pass}</Text>
            <Text style={s.chipLabel}>양호</Text>
          </View>
        </View>

        {result.categories.map((cat) => (
          <View key={cat.key} style={s.barRow}>
            <Text style={s.barLabel}>{cat.label}</Text>
            <View style={s.barTrack}>
              <View
                style={[
                  s.barFill,
                  {
                    width: `${cat.score ?? 0}%`,
                    backgroundColor: cat.score == null ? BORDER : scoreColor(cat.score),
                  },
                ]}
              />
            </View>
            <Text style={[s.barScore, { color: scoreColor(cat.score) }]}>
              {cat.score != null ? `${cat.score}점` : "측정 외"}
            </Text>
          </View>
        ))}

        {aiSummary && (
          <View style={s.aiBox}>
            <Text style={[s.h3, { color: DEEP, marginBottom: 5 }]}>종합 소견</Text>
            {aiSummary.split("\n").filter(Boolean).map((line, i) => (
              <Text key={i} style={s.bodyText}>
                {line}
              </Text>
            ))}
          </View>
        )}

        <View style={s.methodBox}>
          <Text style={[s.h3, { color: DEEP, marginBottom: 5, fontSize: 10.5 }]}>진단 방법</Text>
          <Text style={s.mutedText}>
            ① 실시간 측정 — 진단 시점에 사이트에 직접 접속해 검색엔진이 보는 원본 HTML, robots.txt·사이트맵,
            구조화 데이터, 네이버 노출, 구글 PageSpeed를 측정했습니다.
          </Text>
          {result.siteWide && (
            <Text style={s.mutedText}>
              ② 사이트 전체 크롤 — 전문 크롤러 데이터로 전체 페이지의 제목·설명문·연결 상태를 분석하고,
              실시간 측정값과 교차 검증했습니다.
            </Text>
          )}
          <Text style={s.mutedText}>
            확인되지 않은 수치는 표기하지 않으며, 측정 불가 항목은 &quot;생략&quot;으로 구분했습니다.
          </Text>
        </View>
      </Page>

      {/* ── 3. 카테고리별 상세 ── */}
      <Page size="A4" style={s.page}>
        <PageChrome host={host} page="항목별 상세" />
        <Text style={s.h2}>항목별 상세 진단</Text>
        {result.categories.map((cat) => (
          <View key={cat.key} style={s.catBlock}>
            <View style={s.catHeader} minPresenceAhead={80}>
              <Text style={s.h3}>{cat.label}</Text>
              <Text style={[s.catScore, { color: scoreColor(cat.score) }]}>
                {cat.score != null ? `${cat.score}점` : "측정 외"}
              </Text>
            </View>
            <Text style={s.catGuide}>{CATEGORY_GUIDE[cat.key] ?? ""}</Text>
            {cat.checks.map((check) => (
              <View key={check.key} style={s.checkCard} wrap={false}>
                <View style={s.checkTop}>
                  <Text style={[s.badge, { backgroundColor: STATUS_META[check.status].color }]}>
                    {STATUS_META[check.status].text}
                  </Text>
                  <Text style={s.checkLabel}>{check.label}</Text>
                </View>
                <Text style={s.checkDetail}>{check.detail}</Text>
                {CHECK_GUIDE[check.key] && (
                  <Text style={s.checkGuide}>{CHECK_GUIDE[check.key]}</Text>
                )}
              </View>
            ))}
          </View>
        ))}

        {result.crossChecks.length > 0 && (
          <View style={s.catBlock}>
            <View style={s.catHeader}>
              <Text style={s.h3}>교차 검증 불일치</Text>
              <Text style={s.catScore}>{result.crossChecks.length}건</Text>
            </View>
            <Text style={s.catGuide}>
              크롤 시점 데이터와 실시간 측정값이 다른 항목입니다. 최근 수정됐거나, 검색엔진이 읽는 원본과
              방문자가 보는 화면이 달라지는 렌더링 문제일 수 있습니다.
            </Text>
            {result.crossChecks.map((f, i) => (
              <View key={i} style={s.checkCard} wrap={false}>
                <Text style={s.checkLabel}>{f.field}</Text>
                <Text style={s.checkDetail}>
                  크롤: {f.crawler.slice(0, 70)} → 현재: {f.live.slice(0, 70)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Page>

      {/* ── 4. 사이트 전체 분석 (크롤 데이터) ── */}
      {result.siteWide && (
        <Page size="A4" style={s.page}>
          <PageChrome host={host} page="사이트 전체 분석" />
          <Text style={s.h2}>사이트 전체 분석</Text>
          <Text style={[s.mutedText, { marginBottom: 12 }]}>
            전체 {result.siteWide.totalUrls}개 URL (HTML {result.siteWide.htmlPages}페이지 · 이미지{" "}
            {result.siteWide.resources.images} · 스크립트 {result.siteWide.resources.scripts} · 스타일{" "}
            {result.siteWide.resources.styles}) 크롤 데이터 기준입니다.
          </Text>

          {result.siteWide.notFound.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={[s.h3, { marginBottom: 4 }]}>깨진 페이지 (404) — {result.siteWide.notFound.length}건</Text>
              {result.siteWide.notFound.map((u, i) => (
                <Text key={i} style={[s.mutedText, { fontSize: 8.5 }]}>
                  · {u}
                </Text>
              ))}
            </View>
          )}

          {result.siteWide.duplicateTitles.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={[s.h3, { marginBottom: 4 }]}>
                중복 타이틀 — {result.siteWide.duplicateTitles.length}종
              </Text>
              <View style={s.tableHead}>
                <Text style={[s.th, { width: "70%" }]}>타이틀</Text>
                <Text style={[s.th, { width: "30%", textAlign: "right" }]}>사용 페이지 수</Text>
              </View>
              {result.siteWide.duplicateTitles.map((d, i) => (
                <View key={i} style={s.tableRow} wrap={false}>
                  <Text style={[s.td, { width: "70%" }]}>{d.title.slice(0, 60)}</Text>
                  <Text style={[s.td, { width: "30%", textAlign: "right" }]}>{d.count}개</Text>
                </View>
              ))}
            </View>
          )}

          {result.siteWide.thinContent.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={[s.h3, { marginBottom: 4 }]}>
                콘텐츠 부족 페이지 (300단어 미만) — {result.siteWide.thinContent.length}건
              </Text>
              <View style={s.tableHead}>
                <Text style={[s.th, { width: "80%" }]}>페이지</Text>
                <Text style={[s.th, { width: "20%", textAlign: "right" }]}>단어 수</Text>
              </View>
              {result.siteWide.thinContent.slice(0, 15).map((t, i) => (
                <View key={i} style={s.tableRow} wrap={false}>
                  <Text style={[s.td, { width: "80%" }]}>{t.url.slice(0, 75)}</Text>
                  <Text style={[s.td, { width: "20%", textAlign: "right" }]}>{t.words}</Text>
                </View>
              ))}
              {result.siteWide.thinContent.length > 15 && (
                <Text style={[s.mutedText, { fontSize: 8.5, marginTop: 3 }]}>
                  외 {result.siteWide.thinContent.length - 15}건
                </Text>
              )}
            </View>
          )}

          {result.siteWide.redirects.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={[s.h3, { marginBottom: 4 }]}>
                리다이렉트 경유 내부링크 — {result.siteWide.redirects.length}건
              </Text>
              {result.siteWide.redirects.slice(0, 12).map((r, i) => (
                <Text key={i} style={[s.mutedText, { fontSize: 8.5 }]}>
                  · {r.from.slice(0, 55)} → {r.to.slice(0, 45)}
                </Text>
              ))}
            </View>
          )}
        </Page>
      )}

      {/* ── 5. 개선 우선순위 + 안내 ── */}
      <Page size="A4" style={s.page}>
        <PageChrome host={host} page="개선 제안" />
        <Text style={s.h2}>개선 우선순위</Text>
        <Text style={[s.mutedText, { marginBottom: 12 }]}>
          발견된 문제·개선 항목을 영향이 큰 순서로 정리했습니다. 위에서부터 처리하는 것을 권장합니다.
        </Text>
        {priorities.length === 0 ? (
          <Text style={s.bodyText}>즉시 조치가 필요한 항목이 발견되지 않았습니다.</Text>
        ) : (
          priorities.map((check, i) => (
            <View key={check.key} style={s.prioItem} wrap={false}>
              <Text style={s.prioNum}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "bold", fontSize: 10 }}>
                  {check.label}{" "}
                  <Text style={{ color: STATUS_META[check.status].color, fontSize: 8.5 }}>
                    ({STATUS_META[check.status].text})
                  </Text>
                </Text>
                <Text style={[s.mutedText, { fontSize: 9 }]}>
                  {check.detail} {CHECK_GUIDE[check.key] ?? ""}
                </Text>
              </View>
            </View>
          ))
        )}

        <View style={s.ctaBox}>
          <Text style={[s.h3, { color: DEEP, marginBottom: 5 }]}>진단 결과 상담 안내</Text>
          <Text style={s.bodyText}>
            {QUOTE_SUPPLIER.name}는 검색과 AI에 발견되는 웹사이트를 구조에서부터 설계하는 검색 마케팅
            회사입니다. 본 리포트의 개선 항목에 대한 상세 상담과 견적은 아래로 문의해 주세요.
          </Text>
          <Text style={[s.bodyText, { marginTop: 6, fontWeight: "bold" }]}>
            {QUOTE_SUPPLIER.phone} · {QUOTE_SUPPLIER.email} · {QUOTE_SUPPLIER.website}
          </Text>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
