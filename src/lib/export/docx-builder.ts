import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import type { ReportDocModel } from "@/lib/export/report-model";

// 옵티파이 브랜딩 색상 (# 없이)
const DEEP = "057A4E";
const INK = "1A2421";

/**
 * 정규 문서 모델 → docx Buffer.
 * 생성 로직을 이 유틸에 분리(다른 프로젝트 재사용 목적).
 */
export async function buildDocx(model: ReportDocModel): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({ text: model.title, bold: true, size: 36, color: DEEP }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: model.subtitle, size: 22, color: INK }),
      ],
      spacing: { after: 300 },
    }),
  ];

  for (const section of model.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({ text: section.heading, bold: true, color: DEEP }),
        ],
        spacing: { before: 240, after: 100 },
      }),
    );
    for (const line of section.lines) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 22, color: INK })],
          spacing: { after: 60 },
        }),
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
