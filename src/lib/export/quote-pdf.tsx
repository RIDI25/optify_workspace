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
import { won, koreanMoney, type QuoteDocModel } from "@/lib/export/quote-model";

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

// 품목 테이블 컬럼 폭(%)
const COL = { no: "6%", name: "24%", detail: "30%", qty: "8%", unit: "8%", price: "12%", amount: "12%" } as const;

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Pretendard", color: INK, fontSize: 9.5 },
  title: { fontSize: 26, fontWeight: "bold", textAlign: "center", letterSpacing: 14 },
  accentBar: { height: 3, backgroundColor: ACCENT, marginTop: 10, marginBottom: 14 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  infoWrap: { flexDirection: "row", gap: 12, marginBottom: 14 },
  infoBox: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 3, padding: 10 },
  infoTitle: { fontSize: 10, fontWeight: "bold", color: DEEP, marginBottom: 6 },
  infoRow: { flexDirection: "row", marginBottom: 3 },
  infoLabel: { width: 62, color: "#6b7772" },
  infoValue: { flex: 1 },
  totalLine: { backgroundColor: TINT, padding: 8, marginBottom: 12, borderRadius: 3 },
  totalLineText: { fontSize: 11, fontWeight: "bold", color: DEEP },
  table: { borderWidth: 1, borderColor: BORDER },
  tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER },
  trHead: { flexDirection: "row", backgroundColor: TINT },
  th: { fontWeight: "bold", color: DEEP, padding: 5, fontSize: 9 },
  td: { padding: 5 },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  catRow: { backgroundColor: "#f5f7f6" },
  catText: { fontWeight: "bold", color: DEEP, fontSize: 8.5, padding: 4, paddingLeft: 6 },
  sumWrap: { marginTop: 10, alignSelf: "flex-end", width: 220 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  sumTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: INK,
    marginTop: 3,
    paddingTop: 5,
  },
  notesTitle: { fontSize: 10, fontWeight: "bold", color: DEEP, marginTop: 16, marginBottom: 4 },
  notesLine: { lineHeight: 1.5, marginBottom: 1 },
  footer: { marginTop: 28, alignItems: "center" },
  footerText: { fontSize: 10, marginBottom: 14 },
  signRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  signName: { fontSize: 13, fontWeight: "bold" },
});

function Cell({
  width,
  children,
  align,
  bold,
}: {
  width: string;
  children: React.ReactNode;
  align?: "right" | "center";
  bold?: boolean;
}) {
  return (
    <Text
      style={[
        s.td,
        { width },
        align === "right" ? s.right : align === "center" ? s.center : {},
        bold ? { fontWeight: "bold" } : {},
      ]}
    >
      {children}
    </Text>
  );
}

export async function renderQuotePdf(model: QuoteDocModel): Promise<Buffer> {
  ensureFonts();
  const { supplier, totals } = model;

  // 카테고리 구분행을 위해 순서 유지 그룹핑 (수기 품목 = category null → '기타')
  const rows: { type: "cat" | "item"; label?: string; item?: (typeof model.items)[number]; no?: number }[] = [];
  let lastCat: string | null | undefined = undefined;
  let no = 0;
  for (const item of model.items) {
    const cat = item.category ?? "기타";
    if (cat !== lastCat) {
      rows.push({ type: "cat", label: cat });
      lastCat = cat;
    }
    rows.push({ type: "item", item, no: ++no });
  }

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>견 적 서</Text>
        <View style={s.accentBar} />

        <View style={s.metaRow}>
          <Text>견적번호: {model.quoteNo}</Text>
          <Text>
            견적일: {model.quoteDate}
            {model.validUntil ? `  ·  유효기간: ${model.validUntil}까지` : ""}
          </Text>
        </View>

        <View style={s.infoWrap}>
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>수신</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>고객사명</Text>
              <Text style={[s.infoValue, { fontWeight: "bold" }]}>{model.customerName} 귀중</Text>
            </View>
            {model.customerContact && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>담당자</Text>
                <Text style={s.infoValue}>{model.customerContact}</Text>
              </View>
            )}
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>안내</Text>
              <Text style={s.infoValue}>아래와 같이 견적합니다.</Text>
            </View>
          </View>

          <View style={s.infoBox}>
            <Text style={s.infoTitle}>공급자</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>상호</Text>
              <Text style={s.infoValue}>{supplier.name}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>대표</Text>
              <Text style={s.infoValue}>{supplier.representative} (인)</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>사업자번호</Text>
              <Text style={s.infoValue}>{supplier.businessNumber}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>주소</Text>
              <Text style={s.infoValue}>{supplier.address}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>연락처</Text>
              <Text style={s.infoValue}>
                {supplier.phone} · {supplier.email}
              </Text>
            </View>
          </View>
        </View>

        <View style={s.totalLine}>
          <Text style={s.totalLineText}>
            일금 {koreanMoney(totals.total)} 원정 ({won(totals.total)}, VAT 포함)
          </Text>
        </View>

        <View style={s.table}>
          <View style={s.trHead}>
            <Text style={[s.th, s.center, { width: COL.no }]}>No</Text>
            <Text style={[s.th, { width: COL.name }]}>품목</Text>
            <Text style={[s.th, { width: COL.detail }]}>내역</Text>
            <Text style={[s.th, s.center, { width: COL.qty }]}>수량</Text>
            <Text style={[s.th, s.center, { width: COL.unit }]}>단위</Text>
            <Text style={[s.th, s.right, { width: COL.price }]}>단가</Text>
            <Text style={[s.th, s.right, { width: COL.amount }]}>금액</Text>
          </View>
          {rows.map((row, i) =>
            row.type === "cat" ? (
              <View key={i} style={[s.tr, s.catRow]}>
                <Text style={s.catText}>{row.label}</Text>
              </View>
            ) : (
              <View key={i} style={s.tr} wrap={false}>
                <Cell width={COL.no} align="center">{row.no}</Cell>
                <Cell width={COL.name}>{row.item!.name}</Cell>
                <Cell width={COL.detail}>{row.item!.detail}</Cell>
                <Cell width={COL.qty} align="center">{row.item!.qty}</Cell>
                <Cell width={COL.unit} align="center">{row.item!.unit}</Cell>
                <Cell width={COL.price} align="right">{row.item!.unit_price.toLocaleString("ko-KR")}</Cell>
                <Cell width={COL.amount} align="right">{row.item!.amount.toLocaleString("ko-KR")}</Cell>
              </View>
            ),
          )}
        </View>

        <View style={s.sumWrap}>
          <View style={s.sumRow}>
            <Text>공급가액</Text>
            <Text>{won(totals.supply)}</Text>
          </View>
          <View style={s.sumRow}>
            <Text>부가세 (10%)</Text>
            <Text>{won(totals.vat)}</Text>
          </View>
          <View style={s.sumTotal}>
            <Text style={{ fontWeight: "bold" }}>합계 (VAT 포함)</Text>
            <Text style={{ fontWeight: "bold", color: DEEP, fontSize: 11 }}>{won(totals.total)}</Text>
          </View>
        </View>

        {model.notes && (
          <View>
            <Text style={s.notesTitle}>특약사항 · 비고</Text>
            {model.notes.split("\n").map((line, i) => (
              <Text key={i} style={s.notesLine}>
                {line}
              </Text>
            ))}
          </View>
        )}

        <View style={s.footer}>
          <Text style={s.footerText}>위와 같이 견적서를 제출합니다.</Text>
          <View style={s.signRow}>
            <Text style={s.signName}>{supplier.name}</Text>
            <Text>대표 {supplier.representative} (인)</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
