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
import { DEPOSIT_RATE, QUOTE_BANK } from "@/lib/quote-config";
import {
  won,
  koreanMoney,
  splitPayment,
  vatBreakdown,
  type InvoiceStage,
  type QuoteDocModel,
} from "@/lib/export/quote-model";

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
  page: { padding: 44, fontFamily: "Pretendard", color: INK, fontSize: 10 },
  title: { fontSize: 26, fontWeight: "bold", textAlign: "center", letterSpacing: 14 },
  accentBar: { height: 3, backgroundColor: ACCENT, marginTop: 10, marginBottom: 14 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  infoWrap: { flexDirection: "row", gap: 12, marginBottom: 14 },
  infoBox: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 3, padding: 10 },
  infoTitle: { fontSize: 10, fontWeight: "bold", color: DEEP, marginBottom: 6 },
  infoRow: { flexDirection: "row", marginBottom: 3 },
  infoLabel: { width: 62, color: "#6b7772" },
  infoValue: { flex: 1 },
  totalLine: { backgroundColor: TINT, padding: 10, marginBottom: 14, borderRadius: 3 },
  totalLineText: { fontSize: 12, fontWeight: "bold", color: DEEP },
  table: { borderWidth: 1, borderColor: BORDER },
  trHead: { flexDirection: "row", backgroundColor: TINT },
  tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER },
  th: { fontWeight: "bold", color: DEEP, padding: 6, fontSize: 9.5 },
  td: { padding: 6 },
  sumWrap: { marginTop: 10, alignSelf: "flex-end", width: 240 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  sumTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: INK,
    marginTop: 3,
    paddingTop: 5,
  },
  bankBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    padding: 10,
  },
  footer: { marginTop: 28, alignItems: "center" },
  footerText: { fontSize: 10, marginBottom: 14 },
  signRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  signName: { fontSize: 13, fontWeight: "bold" },
});

const COL = { name: "40%", detail: "36%", amount: "24%" } as const;

const STAGE_LABEL: Record<InvoiceStage, string> = {
  full: "전액",
  deposit: "계약금",
  balance: "잔금",
};

export async function renderInvoicePdf(
  model: QuoteDocModel,
  stage: InvoiceStage,
  issueDate: string,
  dueDate: string,
): Promise<Buffer> {
  ensureFonts();
  const { supplier, totals } = model;
  const { deposit, balance } = splitPayment(totals.total, DEPOSIT_RATE);
  const depositPct = Math.round(DEPOSIT_RATE * 100);

  const claimed = stage === "full" ? totals.total : stage === "deposit" ? deposit : balance;
  const breakdown = stage === "full" ? { supply: totals.supply, vat: totals.vat } : vatBreakdown(claimed);

  const rows: { name: string; detail: string; amount: number }[] =
    stage === "full"
      ? model.items.map((it) => ({
          name: it.name,
          detail: `${it.detail} · ${it.qty}${it.unit}`,
          amount: it.amount,
        }))
      : [
          {
            name: stage === "deposit" ? "계약금" : "잔금",
            detail: `총 계약 금액 ${won(totals.total)}의 ${stage === "deposit" ? depositPct : 100 - depositPct}% · 견적번호 ${model.quoteNo}`,
            amount: claimed,
          },
        ];

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>청 구 서</Text>
        <View style={s.accentBar} />

        <View style={s.metaRow}>
          <Text>
            청구번호: {model.quoteNo}-{stage.toUpperCase()}
          </Text>
          <Text>
            발행일: {issueDate}  ·  납부기한: {dueDate}
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
              <Text style={s.infoLabel}>구분</Text>
              <Text style={s.infoValue}>{STAGE_LABEL[stage]} 청구</Text>
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
              <Text style={s.infoValue}>{supplier.representative}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>사업자번호</Text>
              <Text style={s.infoValue}>{supplier.businessNumber}</Text>
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
            청구 금액: 일금 {koreanMoney(claimed)} 원정 ({won(claimed)}, VAT 포함)
          </Text>
        </View>

        <View style={s.table}>
          <View style={s.trHead}>
            <Text style={[s.th, { width: COL.name }]}>내역</Text>
            <Text style={[s.th, { width: COL.detail }]}>비고</Text>
            <Text style={[s.th, { width: COL.amount, textAlign: "right" }]}>금액</Text>
          </View>
          {rows.map((row, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={[s.td, { width: COL.name }]}>{row.name}</Text>
              <Text style={[s.td, { width: COL.detail }]}>{row.detail}</Text>
              <Text style={[s.td, { width: COL.amount, textAlign: "right" }]}>
                {row.amount.toLocaleString("ko-KR")}
              </Text>
            </View>
          ))}
        </View>

        <View style={s.sumWrap}>
          <View style={s.sumRow}>
            <Text>공급가액</Text>
            <Text>{won(breakdown.supply)}</Text>
          </View>
          <View style={s.sumRow}>
            <Text>부가세 (10%)</Text>
            <Text>{won(breakdown.vat)}</Text>
          </View>
          <View style={s.sumTotal}>
            <Text style={{ fontWeight: "bold" }}>청구 금액 (VAT 포함)</Text>
            <Text style={{ fontWeight: "bold", color: DEEP, fontSize: 11.5 }}>{won(claimed)}</Text>
          </View>
        </View>

        <View style={s.bankBox}>
          <Text style={{ fontWeight: "bold", color: DEEP, marginBottom: 3 }}>입금 계좌</Text>
          <Text>
            {QUOTE_BANK
              ? `${QUOTE_BANK.bank} ${QUOTE_BANK.account} (예금주: ${QUOTE_BANK.holder})`
              : "별도 안내"}
          </Text>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>위 금액을 청구하오니 납부기한 내 입금 부탁드립니다.</Text>
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
