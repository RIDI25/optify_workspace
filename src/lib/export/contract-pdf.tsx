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
import { CONTRACT_CLAUSES, fillClause } from "@/lib/contract-terms";
import { DEPOSIT_RATE, QUOTE_BANK } from "@/lib/quote-config";
import { won, splitPayment, type QuoteDocModel } from "@/lib/export/quote-model";

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

const s = StyleSheet.create({
  page: { padding: 44, fontFamily: "Pretendard", color: INK, fontSize: 9.5 },
  title: { fontSize: 24, fontWeight: "bold", textAlign: "center", letterSpacing: 10 },
  accentBar: { height: 3, backgroundColor: ACCENT, marginTop: 10, marginBottom: 14 },
  intro: { lineHeight: 1.6, marginBottom: 10 },
  overviewBox: { borderWidth: 1, borderColor: BORDER, borderRadius: 3, padding: 10, marginBottom: 14, backgroundColor: TINT },
  overviewRow: { flexDirection: "row", marginBottom: 3 },
  overviewLabel: { width: 90, color: "#3d5248", fontWeight: "bold" },
  clauseTitle: { fontSize: 10.5, fontWeight: "bold", color: DEEP, marginTop: 10, marginBottom: 3 },
  clauseBody: { lineHeight: 1.55, marginBottom: 2 },
  notesBox: { marginTop: 10 },
  signWrap: { marginTop: 26 },
  signDate: { textAlign: "center", marginBottom: 18, fontSize: 10 },
  signRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 30 },
  signCol: { width: "45%" },
  signLabel: { fontSize: 10, fontWeight: "bold", color: DEEP, marginBottom: 5 },
  signLine: { lineHeight: 1.6 },
  attachTitle: { fontSize: 11, fontWeight: "bold", color: DEEP, marginBottom: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  th: { fontWeight: "bold", color: DEEP, padding: 5, fontSize: 9, backgroundColor: TINT },
  td: { padding: 5 },
});

const COL = { no: "8%", name: "36%", detail: "32%", qty: "12%", amount: "12%" } as const;

export async function renderContractPdf(
  model: QuoteDocModel,
  contractDate: string,
): Promise<Buffer> {
  ensureFonts();
  const { supplier, totals } = model;
  const { deposit, balance } = splitPayment(totals.total, DEPOSIT_RATE);
  const vars: Record<string, string> = {
    supplier: supplier.name,
    customer: model.customerName,
    total: won(totals.total),
    supply: won(totals.supply),
    vat: won(totals.vat),
    deposit: won(deposit),
    balance: won(balance),
    depositRate: String(Math.round(DEPOSIT_RATE * 100)),
    balanceRate: String(100 - Math.round(DEPOSIT_RATE * 100)),
    validUntil: model.validUntil ?? "",
    bank: QUOTE_BANK
      ? ` (입금계좌: ${QUOTE_BANK.bank} ${QUOTE_BANK.account} ${QUOTE_BANK.holder})`
      : "",
  };

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>용역 계약서</Text>
        <View style={s.accentBar} />

        <Text style={s.intro}>
          {model.customerName}(이하 &quot;갑&quot;)과 {supplier.name}(이하 &quot;을&quot;)은
          아래 용역의 수행에 관하여 다음과 같이 계약을 체결한다.
        </Text>

        <View style={s.overviewBox}>
          <View style={s.overviewRow}>
            <Text style={s.overviewLabel}>용역명</Text>
            <Text>
              {model.endClientName ? `[${model.endClientName}] ` : ""}홈페이지 제작 및 SEO/GEO
              최적화 용역 (견적번호 {model.quoteNo})
            </Text>
          </View>
          <View style={s.overviewRow}>
            <Text style={s.overviewLabel}>총 계약 금액</Text>
            <Text style={{ fontWeight: "bold" }}>
              {won(totals.total)} (공급가액 {won(totals.supply)} · 부가세 {won(totals.vat)})
            </Text>
          </View>
          <View style={s.overviewRow}>
            <Text style={s.overviewLabel}>대금 지급</Text>
            <Text>
              계약금 {won(deposit)} ({vars.depositRate}%) · 잔금 {won(balance)} ({vars.balanceRate}%)
            </Text>
          </View>
          {QUOTE_BANK && (
            <View style={s.overviewRow}>
              <Text style={s.overviewLabel}>입금 계좌</Text>
              <Text>
                {QUOTE_BANK.bank} {QUOTE_BANK.account} ({QUOTE_BANK.holder})
              </Text>
            </View>
          )}
        </View>

        {CONTRACT_CLAUSES.map((clause, i) => (
          <View key={i} wrap={false}>
            <Text style={s.clauseTitle}>{clause.title}</Text>
            {clause.body.map((line, j) => (
              <Text key={j} style={s.clauseBody}>
                {fillClause(line, vars)}
              </Text>
            ))}
          </View>
        ))}

        {model.notes && (
          <View style={s.notesBox} wrap={false}>
            <Text style={s.clauseTitle}>특약사항</Text>
            {model.notes.split("\n").map((line, i) => (
              <Text key={i} style={s.clauseBody}>
                {line}
              </Text>
            ))}
          </View>
        )}

        <View style={s.signWrap} wrap={false}>
          <Text style={s.signDate}>{contractDate}</Text>
          <View style={s.signRow}>
            <View style={s.signCol}>
              <Text style={s.signLabel}>갑 (발주자)</Text>
              <Text style={s.signLine}>상호: {model.customerName}</Text>
              {model.customerContact && <Text style={s.signLine}>담당: {model.customerContact}</Text>}
              <Text style={s.signLine}>대표: ____________ (인)</Text>
            </View>
            <View style={s.signCol}>
              <Text style={s.signLabel}>을 (수행자)</Text>
              <Text style={s.signLine}>상호: {supplier.name}</Text>
              <Text style={s.signLine}>사업자번호: {supplier.businessNumber}</Text>
              <Text style={s.signLine}>대표: {supplier.representative} (인)</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* 별첨: 용역 내역 */}
      <Page size="A4" style={s.page}>
        <Text style={s.attachTitle}>[별첨] 용역 내역 — 견적번호 {model.quoteNo}</Text>
        <View style={[s.tr, { borderTopWidth: 1, borderTopColor: BORDER }]}>
          <Text style={[s.th, { width: COL.no, textAlign: "center" }]}>No</Text>
          <Text style={[s.th, { width: COL.name }]}>품목</Text>
          <Text style={[s.th, { width: COL.detail }]}>내역</Text>
          <Text style={[s.th, { width: COL.qty, textAlign: "center" }]}>수량</Text>
          <Text style={[s.th, { width: COL.amount, textAlign: "right" }]}>금액</Text>
        </View>
        {model.items.map((item, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={[s.td, { width: COL.no, textAlign: "center" }]}>{i + 1}</Text>
            <Text style={[s.td, { width: COL.name }]}>{item.name}</Text>
            <Text style={[s.td, { width: COL.detail }]}>{item.detail}</Text>
            <Text style={[s.td, { width: COL.qty, textAlign: "center" }]}>
              {item.qty}
              {item.unit}
            </Text>
            <Text style={[s.td, { width: COL.amount, textAlign: "right" }]}>
              {item.amount.toLocaleString("ko-KR")}
            </Text>
          </View>
        ))}
        <View style={{ marginTop: 10, alignSelf: "flex-end", width: 220 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
            <Text>공급가액</Text>
            <Text>{won(totals.supply)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
            <Text>부가세 (10%)</Text>
            <Text>{won(totals.vat)}</Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              borderTopWidth: 1,
              borderTopColor: INK,
              marginTop: 3,
              paddingTop: 4,
            }}
          >
            <Text style={{ fontWeight: "bold" }}>합계 (VAT 포함)</Text>
            <Text style={{ fontWeight: "bold", color: DEEP }}>{won(totals.total)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
