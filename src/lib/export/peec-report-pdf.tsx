import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { channelLabel, type PeecSummary } from "@/lib/peec";
import {
  Bul,
  GroupedBars,
  H2,
  InsightBlock,
  LineChartSvg,
  R,
  SERIES,
  T,
  Table,
  ensureFonts,
  fmtDate,
  fmtDateTime,
  pdfStyles as s,
  type Align,
  type Cell,
} from "@/lib/export/tracker-report-pdf";

const pct = (v: number | null | undefined) => (v == null ? "-" : `${Math.round(v * 100)}%`);

/** 질문별 칸 색: 67% 이상 초록, 조금이라도 있으면 파랑, 0 빨강 */
function visCell(v: number | null | undefined): Cell {
  if (v == null) return { text: "-", color: "#9CA3AF" };
  if (v >= 0.67) return { text: pct(v), bg: "#DCFCE7", color: "#166534", bold: true };
  if (v > 0) return { text: pct(v), bg: "#DBEAFE", color: "#1E40AF" };
  return { text: "0%", bg: "#FEF2F2", color: "#991B1B" };
}

/**
 * 고객사 전달용 AI 노출(GEO) 리포트 — Peec AI 결과 (2026-09-28).
 * 표·그래프는 트래커 리포트(tracker-report-pdf.tsx)와 같은 부품을 쓴다. 함정은 memory reference-react-pdf-pitfalls 참고.
 */
export async function renderPeecReportPdf(sm: PeecSummary, clientName: string, insight: { text: string; created_at: string } | null): Promise<Buffer> {
  ensureFonts();
  const chans = sm.channels;
  const days = sm.trend.length;
  const empty = sm.prompts.filter((p) => !p.visibility);
  const best = [...chans].sort((a, b) => (b.visibility ?? 0) - (a.visibility ?? 0))[0];
  const worst = [...chans].sort((a, b) => (a.visibility ?? 0) - (b.visibility ?? 0))[0];
  const highlights: string[] = [
    `AI 답변 ${sm.total.answers}건 가운데 ${sm.total.visible}건(${pct(sm.total.visibility)})에 ${clientName}이(가) 나왔습니다.`,
    ...(best && worst && best.channel !== worst.channel ? [`가장 잘 나오는 곳은 ${channelLabel(best.name)}(${pct(best.visibility)}), 가장 약한 곳은 ${channelLabel(worst.name)}(${pct(worst.visibility)})입니다.`] : []),
    `질문 ${sm.prompts.length}개 중 ${sm.prompts.length - empty.length}개에서 한 번 이상 나왔고, ${empty.length}개에서는 한 번도 나오지 않았습니다.`,
    sm.ownDomainRank ? `우리 사이트는 AI 가 인용한 출처 ${sm.domainsTotal}곳 가운데 ${sm.ownDomainRank}위입니다.` : `우리 사이트는 이번 기간 AI 인용 출처에 없습니다.`,
  ];
  const promptWidths = [100 - 11 * chans.length - 0, ...chans.map(() => 11)];

  const doc = (
    <Document title={`${clientName} AI 노출(GEO) 리포트`} author="옵티파이">
      <Page size="A4" style={s.page} wrap>
        <Text style={s.brand}>OPTIFY · AI 검색 노출 측정</Text>
        <Text style={s.title}>{clientName} AI 노출(GEO) 리포트</Text>
        <View style={s.bar} />
        <View style={s.meta}>
          {[
            ["고객사", clientName],
            ["기간", `${sm.period.start} ~ ${sm.period.end} (${days}일 측정)`],
            ["측정 채널", chans.map((c) => channelLabel(c.name)).join(", ")],
            ["측정 대상", `질문 ${sm.prompts.length}개 · AI 답변 ${sm.chatCount ?? sm.total.answers}건`],
            ["작성", `${fmtDate(new Date().toISOString())} · 옵티파이 (측정 데이터: Peec AI)`],
          ].map(([k, v], i, arr) => (
            <View key={k} style={[s.metaRow, i === arr.length - 1 ? { borderBottomWidth: 0 } : {}]}>
              <Text style={s.metaK}>{k}</Text>
              <Text style={s.metaV}>{v}</Text>
            </View>
          ))}
        </View>

        <H2>1. 한눈에 보기</H2>
        <View style={s.kpis}>
          {[
            ["노출률", pct(sm.total.visibility), `답변 ${sm.total.answers}건 중 ${sm.total.visible}건`],
            ["언급", `${sm.total.mentions}회`, "답변 본문에 이름이 나온 횟수"],
            ["평균 순위", sm.total.position == null ? "-" : `${sm.total.position.toFixed(1)}위`, "답변 안에서 몇 번째"],
            ["우리 사이트 인용", sm.ownDomainRank ? `${sm.ownDomainRank}위` : "없음", `출처 ${sm.domainsTotal}곳 중`],
          ].map(([l, v, sub]) => (
            <View key={l} style={s.kpi}>
              <Text style={s.kpiLabel}>{l}</Text>
              <Text style={s.kpiValue}>{v}</Text>
              <Text style={s.kpiSub}>{sub}</Text>
            </View>
          ))}
        </View>
        <View style={s.box} wrap={false}>
          {highlights.map((h, i) => (
            <Bul key={i}>{h}</Bul>
          ))}
        </View>

        <H2>2. 채널별 결과</H2>
        <View wrap={false}>
          <GroupedBars groups={chans.map((c) => ({ label: channelLabel(c.name), values: [c.visibility == null ? null : c.visibility * 100] }))} series={[{ name: "노출률", color: SERIES[0] }]} height={150} />
        </View>
        <Table
          head={["채널", "답변", "노출", "노출률", "언급", "평균 순위"]}
          widths={[32, 13, 13, 14, 13, 15]}
          align={["left", R, R, R, R, R]}
          rows={chans.map((c) => [T(channelLabel(c.name), { bold: true }), T(c.answers), T(c.visible), T(pct(c.visibility)), T(c.mentions), T(c.position == null ? "-" : `${c.position.toFixed(1)}위`)])}
        />

        {days >= 2 ? (
          <>
            <H2>3. 일별 노출률</H2>
            <View wrap={false}>
              <LineChartSvg labels={sm.trend.map((t) => t.date.slice(5).replace("-", "/"))} series={[{ name: "노출률", color: SERIES[0], values: sm.trend.map((t) => t.visibility) }]} height={150} />
            </View>
          </>
        ) : (
          <View wrap={false}>
            <H2>3. 일별 노출률</H2>
            <View style={s.box}>
              <Text>이번 기간은 측정이 {days}일치라 추이 그래프를 그리지 않았습니다. 매일 측정이 쌓이면 흐름이 나타납니다.</Text>
            </View>
          </View>
        )}

        <View wrap={false}>
          <H2>4. 언급 점유율</H2>
          {sm.shareOfVoice.length > 1 ? (
            <Table
              head={["브랜드", "언급", "점유율"]}
              widths={[60, 20, 20]}
              align={["left", R, R]}
              rows={sm.shareOfVoice.slice(0, 10).map((b) => [T(`${b.brand}${b.own ? " (우리)" : ""}`, { bold: b.own, color: b.own ? "#1D4ED8" : undefined }), T(b.mentions), T(pct(b.share))])}
            />
          ) : (
            <View style={s.box}>
              <Text>비교할 경쟁 브랜드가 등록돼 있지 않아 점유율을 계산하지 않았습니다.</Text>
            </View>
          )}
        </View>

        <H2>5. 질문별 노출률</H2>
        <Table
          compact={chans.length > 3}
          head={["질문", ...chans.map((c) => channelLabel(c.name))]}
          widths={promptWidths}
          align={["left", ...chans.map((): Align => "center")]}
          rows={sm.prompts.map((p) => [T(p.text, { bold: true }), ...chans.map((c) => visCell(p.cells[c.channel]))])}
        />
        <Text style={s.note}>칸 = 그 채널에서 같은 질문을 여러 번 물었을 때 우리 브랜드가 나온 비율. 초록 = 67% 이상, 파랑 = 가끔, 빨강 = 한 번도 안 나옴.</Text>

        <H2>6. AI 가 많이 인용한 출처</H2>
        <Table
          head={["순위", "도메인", "분류", "인용"]}
          widths={[10, 50, 22, 18]}
          align={["right", "left", "left", R]}
          rows={sm.topDomains.map((d, i) => [T(i + 1), T(`${d.domain}${d.own ? " (우리)" : ""}`, { bold: d.own, color: d.own ? "#1D4ED8" : undefined }), T(d.classification ?? ""), T(d.citations)])}
        />

        {insight ? (
          <>
            <H2>7. 해석과 다음 조치</H2>
            <InsightBlock text={insight.text} />
            <Text style={s.note}>작성 {fmtDateTime(insight.created_at)} · 옵티파이 분석 (AI 보조, 위 표의 숫자만 근거로 작성)</Text>
          </>
        ) : (
          <View wrap={false}>
            <H2>7. 해석과 다음 조치</H2>
            <View style={s.box}>
              <Text>해석이 아직 작성되지 않았습니다. 워크스페이스 GEO 탭에서 &apos;추론 생성&apos;을 누른 뒤 다시 출력하세요.</Text>
            </View>
          </View>
        )}

        <View wrap={false}>
          <H2>8. 이 리포트 읽는 법</H2>
          <View style={s.box}>
            <Bul>채널 = 어느 AI 에게 물었는지 (ChatGPT, 구글 AI 개요, 네이버 AI 브리핑). 같은 질문을 매일 여러 번 묻습니다.</Bul>
            <Bul>노출률 = AI 답변 가운데 우리 브랜드가 나온 비율. 평균 순위 = 답변 안에서 몇 번째로 나왔는지.</Bul>
            <Bul>인용 출처 = AI 가 답의 근거로 링크한 사이트. 우리 사이트가 위에 있을수록 AI 가 우리 글을 믿고 가져다 씁니다.</Bul>
            <Bul>AI 답변은 매번 조금씩 달라서 한 번의 값보다 몇 주에 걸친 흐름을 봅니다.</Bul>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>옵티파이 · optify.kr · 측정 데이터 Peec AI</Text>
          <Text>{`${clientName} AI 노출(GEO) · ${sm.period.start} ~ ${sm.period.end}`}</Text>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
