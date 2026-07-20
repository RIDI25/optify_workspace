/** 견적서 문서 모델 + 합계 계산 (PDF/docx 공통) */

import type { QuoteSupplier } from "@/lib/quote-config";

export type VatMode = "excluded" | "included";

/** 견적 품목 행 — quotes.items jsonb에 그대로 스냅샷 저장 */
export interface QuoteLineItem {
  category: string | null; // 카탈로그 카테고리, 수기 품목은 null
  name: string;
  detail: string;
  qty: number;
  unit: string;
  unit_price: number;
  amount: number; // qty * unit_price
}

export interface QuoteTotals {
  supply: number; // 공급가액
  vat: number; // 부가세
  total: number; // 합계
}

export interface QuoteDocModel {
  quoteNo: string;
  customerName: string;
  customerContact: string | null;
  quoteDate: string; // 'YYYY-MM-DD'
  validUntil: string | null;
  supplier: QuoteSupplier;
  items: QuoteLineItem[];
  vatMode: VatMode;
  totals: QuoteTotals;
  notes: string | null;
}

/** 품목 합에서 공급가액·부가세·합계 산출.
 *  excluded: 입력 단가가 공급가 → 부가세 10% 가산.
 *  included: 입력 단가가 VAT 포함가 → 역산(합계 ÷ 1.1). */
export function calcQuoteTotals(items: QuoteLineItem[], vatMode: VatMode): QuoteTotals {
  const sum = items.reduce((acc, it) => acc + (it.amount || 0), 0);
  if (vatMode === "included") {
    const supply = Math.round(sum / 1.1);
    return { supply, vat: sum - supply, total: sum };
  }
  const vat = Math.round(sum * 0.1);
  return { supply: sum, vat, total: sum + vat };
}

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

const KO_DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const KO_SMALL = ["", "십", "백", "천"];
const KO_BIG = ["", "만", "억", "조"];

/** 금액 한글 표기: 3,300,000 → '삼백삼십만' (일금 {결과} 원정) */
export function koreanMoney(n: number): string {
  n = Math.round(n);
  if (n <= 0) return "영";
  let result = "";
  for (let bi = 0; n > 0; bi++, n = Math.floor(n / 10000)) {
    let chunk = n % 10000;
    if (!chunk) continue;
    let s = "";
    for (let i = 0; chunk > 0; i++, chunk = Math.floor(chunk / 10)) {
      const d = chunk % 10;
      if (!d) continue;
      // 십·백·천 앞의 '일'은 관례상 생략 (일십 → 십)
      s = (d === 1 && i > 0 ? "" : KO_DIGITS[d]) + KO_SMALL[i] + s;
    }
    result = s + KO_BIG[bi] + result;
  }
  return result;
}
