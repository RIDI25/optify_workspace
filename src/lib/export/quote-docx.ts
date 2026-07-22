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
import { won, koreanMoney, type QuoteDocModel, type QuoteLineItem } from "@/lib/export/quote-model";

// 옵티파이 브랜딩 색상 (# 없이)
const DEEP = "057A4E";
const INK = "1A2421";
const MUTED = "6B7772";
const TINT = "EAFBF2";
const SUBTLE = "F5F7F6";

const text = (t: string, opts: { bold?: boolean; color?: string; size?: number } = {}) =>
  new TextRun({ text: t, bold: opts.bold, color: opts.color ?? INK, size: opts.size ?? 18 });

const cell = (
  t: string,
  opts: {
    bold?: boolean;
    color?: string;
    width?: number; // %
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    fill?: string;
    columnSpan?: number;
  } = {},
) =>
  new TableCell({
    width: opts.width != null ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { fill: opts.fill } : undefined,
    columnSpan: opts.columnSpan,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [text(t, { bold: opts.bold, color: opts.color })],
      }),
    ],
  });

// 품목 테이블 컬럼 폭(%) — PDF와 동일 비율
const COL = { no: 6, name: 24, detail: 30, qty: 8, unit: 8, price: 12, amount: 12 };

export async function buildQuoteDocx(model: QuoteDocModel): Promise<Buffer> {
  const { supplier, totals } = model;

  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          cell("수신", { bold: true, color: DEEP, width: 50, fill: TINT }),
          cell("공급자", { bold: true, color: DEEP, width: 50, fill: TINT }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [
              new Paragraph({ children: [text(`${model.customerName} 귀중`, { bold: true })] }),
              ...(model.endClientName
                ? [new Paragraph({ children: [text(`건명: ${model.endClientName}`)] })]
                : []),
              ...(model.customerContact
                ? [new Paragraph({ children: [text(`담당자: ${model.customerContact}`)] })]
                : []),
              new Paragraph({ children: [text(`견적일: ${model.quoteDate}`)] }),
              ...(model.validUntil
                ? [new Paragraph({ children: [text(`유효기간: ${model.validUntil}까지`)] })]
                : []),
              new Paragraph({ children: [text("아래와 같이 견적합니다.", { color: MUTED })] }),
            ],
          }),
          new TableCell({
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [
              new Paragraph({ children: [text(supplier.name, { bold: true })] }),
              new Paragraph({ children: [text(`대표: ${supplier.representative} (인)`)] }),
              new Paragraph({ children: [text(`사업자번호: ${supplier.businessNumber}`)] }),
              new Paragraph({ children: [text(`주소: ${supplier.address}`)] }),
              new Paragraph({ children: [text(`연락처: ${supplier.phone} · ${supplier.email}`)] }),
            ],
          }),
        ],
      }),
    ],
  });

  const itemHeader = new TableRow({
    tableHeader: true,
    children: [
      cell("No", { bold: true, color: DEEP, width: COL.no, fill: TINT, align: AlignmentType.CENTER }),
      cell("품목", { bold: true, color: DEEP, width: COL.name, fill: TINT }),
      cell("내역", { bold: true, color: DEEP, width: COL.detail, fill: TINT }),
      cell("수량", { bold: true, color: DEEP, width: COL.qty, fill: TINT, align: AlignmentType.CENTER }),
      cell("단위", { bold: true, color: DEEP, width: COL.unit, fill: TINT, align: AlignmentType.CENTER }),
      cell("단가", { bold: true, color: DEEP, width: COL.price, fill: TINT, align: AlignmentType.RIGHT }),
      cell("금액", { bold: true, color: DEEP, width: COL.amount, fill: TINT, align: AlignmentType.RIGHT }),
    ],
  });

  // 카테고리 구분행 포함 품목 행 구성 (수기 품목 = category null → '기타')
  const itemRows: TableRow[] = [];
  let lastCat: string | null | undefined = undefined;
  let no = 0;
  for (const item of model.items as QuoteLineItem[]) {
    const cat = item.category ?? "기타";
    if (cat !== lastCat) {
      itemRows.push(
        new TableRow({
          children: [cell(cat, { bold: true, color: DEEP, fill: SUBTLE, columnSpan: 7 })],
        }),
      );
      lastCat = cat;
    }
    no += 1;
    itemRows.push(
      new TableRow({
        children: [
          cell(String(no), { align: AlignmentType.CENTER }),
          cell(item.name),
          cell(item.detail),
          cell(String(item.qty), { align: AlignmentType.CENTER }),
          cell(item.unit, { align: AlignmentType.CENTER }),
          cell(item.unit_price.toLocaleString("ko-KR"), { align: AlignmentType.RIGHT }),
          cell(item.amount.toLocaleString("ko-KR"), { align: AlignmentType.RIGHT }),
        ],
      }),
    );
  }

  const sumRows = [
    new TableRow({
      children: [
        cell("공급가액", { columnSpan: 6, align: AlignmentType.RIGHT }),
        cell(won(totals.supply), { width: COL.amount, align: AlignmentType.RIGHT }),
      ],
    }),
    new TableRow({
      children: [
        cell("부가세 (10%)", { columnSpan: 6, align: AlignmentType.RIGHT }),
        cell(won(totals.vat), { width: COL.amount, align: AlignmentType.RIGHT }),
      ],
    }),
    new TableRow({
      children: [
        cell("합계 (VAT 포함)", { bold: true, columnSpan: 6, align: AlignmentType.RIGHT, fill: TINT }),
        cell(won(totals.total), {
          bold: true,
          color: DEEP,
          width: COL.amount,
          align: AlignmentType.RIGHT,
          fill: TINT,
        }),
      ],
    }),
  ];

  const itemTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [itemHeader, ...itemRows, ...sumRows],
  });

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "견  적  서", bold: true, size: 44, color: DEEP })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [text(`견적번호: ${model.quoteNo}`, { color: MUTED })],
      spacing: { after: 240 },
    }),
    infoTable,
    new Paragraph({
      children: [
        new TextRun({
          text: `일금 ${koreanMoney(totals.total)} 원정 (${won(totals.total)}, VAT 포함)`,
          bold: true,
          size: 22,
          color: DEEP,
        }),
      ],
      spacing: { before: 240, after: 160 },
    }),
    itemTable,
  ];

  if (model.notes) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "특약사항 · 비고", bold: true, size: 20, color: DEEP })],
        spacing: { before: 280, after: 80 },
      }),
      ...model.notes.split("\n").map(
        (line) => new Paragraph({ children: [text(line)], spacing: { after: 40 } }),
      ),
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [text("위와 같이 견적서를 제출합니다.")],
      spacing: { before: 400, after: 160 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `${supplier.name}  `, bold: true, size: 24, color: INK }),
        text(`대표 ${supplier.representative} (인)`),
      ],
    }),
  );

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
