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

export interface PlanScheduleRow {
  date: string; // YYYY-MM-DD
  weekday: string;
  channelLabel: string;
  title: string;
  keyword: string | null;
}

const s = StyleSheet.create({
  page: { padding: 46, fontFamily: "Pretendard", color: INK, fontSize: 9.5 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  brandDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: ACCENT },
  brandName: { fontSize: 11, fontWeight: "bold", letterSpacing: 1 },
  title: { fontSize: 21, fontWeight: "bold", color: DEEP },
  subtitle: { fontSize: 10.5, color: MUTED, marginTop: 5 },
  accentBar: { height: 3, backgroundColor: ACCENT, marginTop: 12, marginBottom: 14 },
  summary: { backgroundColor: TINT, borderRadius: 3, padding: 10, marginBottom: 14 },
  summaryText: { lineHeight: 1.55 },
  trHead: { flexDirection: "row", backgroundColor: TINT, borderWidth: 1, borderColor: BORDER },
  tr: { flexDirection: "row", borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 },
  th: { padding: 6, fontWeight: "bold", color: DEEP, fontSize: 9 },
  td: { padding: 6 },
  note: { marginTop: 14, fontSize: 8.5, color: MUTED, lineHeight: 1.6 },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 46,
    right: 46,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
    fontSize: 8,
    color: MUTED,
  },
});

const COL = { no: "6%", date: "16%", day: "8%", channel: "16%", title: "40%", keyword: "14%" } as const;

export async function renderPlanSchedulePdf(input: {
  clientName: string;
  start: string;
  end: string;
  rows: PlanScheduleRow[];
  byChannel: { label: string; count: number }[];
}): Promise<Buffer> {
  ensureFonts();
  const { clientName, start, end, rows, byChannel } = input;

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.brandRow} fixed>
          <View style={s.brandDot} />
          <Text style={s.brandName}>OPTIFY</Text>
        </View>

        <Text style={s.title}>콘텐츠 발행 계획서</Text>
        <Text style={s.subtitle}>
          {clientName} 귀중 · 기간 {start} ~ {end}
        </Text>
        <View style={s.accentBar} />

        <View style={s.summary}>
          <Text style={s.summaryText}>
            위 기간 동안 총 {rows.length}건의 콘텐츠 발행을 계획하고 있습니다
            {byChannel.length
              ? ` — ${byChannel.map((c) => `${c.label} ${c.count}건`).join(" · ")}`
              : ""}
            . 각 콘텐츠는 검색 데이터 기반으로 선정한 키워드에 맞춰 제작되며, 발행 후
            검색 노출 성과는 월간 리포트로 보고드립니다.
          </Text>
        </View>

        <View style={s.trHead}>
          <Text style={[s.th, { width: COL.no, textAlign: "center" }]}>No</Text>
          <Text style={[s.th, { width: COL.date }]}>발행 예정일</Text>
          <Text style={[s.th, { width: COL.day, textAlign: "center" }]}>요일</Text>
          <Text style={[s.th, { width: COL.channel }]}>채널</Text>
          <Text style={[s.th, { width: COL.title }]}>콘텐츠 제목(안)</Text>
          <Text style={[s.th, { width: COL.keyword }]}>타깃 키워드</Text>
        </View>
        {rows.map((row, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={[s.td, { width: COL.no, textAlign: "center" }]}>{i + 1}</Text>
            <Text style={[s.td, { width: COL.date }]}>{row.date}</Text>
            <Text style={[s.td, { width: COL.day, textAlign: "center" }]}>{row.weekday}</Text>
            <Text style={[s.td, { width: COL.channel }]}>{row.channelLabel}</Text>
            <Text style={[s.td, { width: COL.title }]}>{row.title}</Text>
            <Text style={[s.td, { width: COL.keyword, color: MUTED }]}>{row.keyword ?? "-"}</Text>
          </View>
        ))}

        <Text style={s.note}>
          · 발행 일정과 제목은 검색 트렌드와 협의 내용에 따라 일부 조정될 수 있습니다.
          {"\n"}· 제목(안)은 초안이며, 제작 과정에서 검색 의도에 맞춰 다듬어집니다.
        </Text>

        <View style={s.footer} fixed>
          <Text>
            {QUOTE_SUPPLIER.name} · {QUOTE_SUPPLIER.phone} · {QUOTE_SUPPLIER.email}
          </Text>
          <Text>{QUOTE_SUPPLIER.website}</Text>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
