import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { CONTRACT_CLAUSES, fillClause } from "@/lib/contract-terms";
import { DEPOSIT_RATE, QUOTE_BANK } from "@/lib/quote-config";
import { won, splitPayment, type QuoteDocModel } from "@/lib/export/quote-model";

// 옵티파이 브랜딩 색상 (# 없이)
const DEEP = "057A4E";
const INK = "1A2421";
const TINT = "EAFBF2";

const text = (t: string, opts: { bold?: boolean; color?: string; size?: number } = {}) =>
  new TextRun({ text: t, bold: opts.bold, color: opts.color ?? INK, size: opts.size ?? 18 });

const para = (t: string, opts: { bold?: boolean; color?: string; size?: number; after?: number } = {}) =>
  new Paragraph({
    children: [text(t, opts)],
    spacing: { after: opts.after ?? 60 },
  });

export async function buildContractDocx(
  model: QuoteDocModel,
  contractDate: string,
): Promise<Buffer> {
  const { supplier, totals } = model;
  const { deposit, balance } = splitPayment(totals.total, DEPOSIT_RATE);
  const depositPct = Math.round(DEPOSIT_RATE * 100);
  const vars: Record<string, string> = {
    supplier: supplier.name,
    customer: model.customerName,
    total: won(totals.total),
    supply: won(totals.supply),
    vat: won(totals.vat),
    deposit: won(deposit),
    balance: won(balance),
    depositRate: String(depositPct),
    balanceRate: String(100 - depositPct),
    validUntil: model.validUntil ?? "",
    bank: QUOTE_BANK
      ? ` (입금계좌: ${QUOTE_BANK.bank} ${QUOTE_BANK.account} ${QUOTE_BANK.holder})`
      : "",
  };

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "용 역 계 약 서", bold: true, size: 40, color: DEEP })],
      spacing: { after: 240 },
    }),
    para(
      `${model.customerName}(이하 "갑")과 ${supplier.name}(이하 "을")은 아래 용역의 수행에 관하여 다음과 같이 계약을 체결한다.`,
      { after: 160 },
    ),
    para(
      `용역명: ${model.endClientName ? `[${model.endClientName}] ` : ""}홈페이지 제작 및 SEO/GEO 최적화 용역 (견적번호 ${model.quoteNo})`,
      { bold: true },
    ),
    para(`총 계약 금액: ${won(totals.total)} (공급가액 ${won(totals.supply)} · 부가세 ${won(totals.vat)})`, { bold: true }),
    para(
      `대금 지급: 계약금 ${won(deposit)} (${depositPct}%) · 잔금 ${won(balance)} (${100 - depositPct}%)` +
        (QUOTE_BANK ? ` · 입금계좌 ${QUOTE_BANK.bank} ${QUOTE_BANK.account} (${QUOTE_BANK.holder})` : ""),
      { bold: true, after: 200 },
    ),
  ];

  for (const clause of CONTRACT_CLAUSES) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: clause.title, bold: true, size: 20, color: DEEP })],
        spacing: { before: 160, after: 60 },
      }),
      ...clause.body.map((line) => para(fillClause(line, vars))),
    );
  }

  if (model.notes) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "특약사항", bold: true, size: 20, color: DEEP })],
        spacing: { before: 160, after: 60 },
      }),
      ...model.notes.split("\n").map((line) => para(line)),
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [text(contractDate)],
      spacing: { before: 360, after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "갑 (발주자)  ", bold: true, color: DEEP, size: 20 }),
        text(`상호: ${model.customerName} · 대표: ____________ (인)`),
      ],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "을 (수행자)  ", bold: true, color: DEEP, size: 20 }),
        text(
          `상호: ${supplier.name} · 사업자번호: ${supplier.businessNumber} · 대표: ${supplier.representative} (인)`,
        ),
      ],
      spacing: { after: 240 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `[별첨] 용역 내역 — 견적번호 ${model.quoteNo}`, bold: true, size: 20, color: DEEP })],
      spacing: { before: 240, after: 100 },
      pageBreakBefore: true,
    }),
  );

  const cell = (
    t: string,
    opts: { bold?: boolean; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; fill?: string } = {},
  ) =>
    new TableCell({
      width: opts.width != null ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
      shading: opts.fill ? { fill: opts.fill } : undefined,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [
        new Paragraph({
          alignment: opts.align,
          children: [text(t, { bold: opts.bold, color: opts.bold ? DEEP : INK })],
        }),
      ],
    });

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell("No", { bold: true, width: 8, fill: TINT, align: AlignmentType.CENTER }),
            cell("품목", { bold: true, width: 34, fill: TINT }),
            cell("내역", { bold: true, width: 34, fill: TINT }),
            cell("수량", { bold: true, width: 10, fill: TINT, align: AlignmentType.CENTER }),
            cell("금액", { bold: true, width: 14, fill: TINT, align: AlignmentType.RIGHT }),
          ],
        }),
        ...model.items.map(
          (item, i) =>
            new TableRow({
              children: [
                cell(String(i + 1), { align: AlignmentType.CENTER }),
                cell(item.name),
                cell(item.detail),
                cell(`${item.qty}${item.unit}`, { align: AlignmentType.CENTER }),
                cell(item.amount.toLocaleString("ko-KR"), { align: AlignmentType.RIGHT }),
              ],
            }),
        ),
        new TableRow({
          children: [
            cell("합계 (VAT 포함)", { bold: true, fill: TINT, align: AlignmentType.RIGHT }),
            cell("", { fill: TINT }),
            cell("", { fill: TINT }),
            cell("", { fill: TINT }),
            cell(won(totals.total), { bold: true, fill: TINT, align: AlignmentType.RIGHT }),
          ],
        }),
      ],
    }),
  );

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
