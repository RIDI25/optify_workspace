/** 견적서 공급자(옵티파이) 정보 — PDF/docx 문서에 표기 */

export interface QuoteSupplier {
  name: string;
  representative: string;
  businessNumber: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

export const QUOTE_SUPPLIER: QuoteSupplier = {
  name: "옵티파이 (Optify)",
  representative: "박유리",
  businessNumber: "572-15-02171",
  address: "부산광역시 강서구 명지국제8로10번길 16, 케이비타워 3층 301호 A06",
  phone: "010-4685-5610",
  email: "yuri_park@optify.kr",
  website: "optify.kr",
};

/** 견적 유효기간 기본값 (일) */
export const QUOTE_VALID_DAYS = 30;

/** 견적번호 접두어: OPT-YYYYMMDD-NN */
export const QUOTE_NO_PREFIX = "OPT";

/** 입금 계좌 — 값 입력 전까지 계약서·청구서에 계좌란 미표기 */
export interface BankAccount {
  bank: string;
  account: string;
  holder: string;
}
export const QUOTE_BANK: BankAccount | null = null;
// 예: export const QUOTE_BANK: BankAccount | null = { bank: "국민은행", account: "000-00-000000", holder: "박유리(옵티파이)" };

/** 대금 지급 구조: 계약금 비율 (잔금 = 나머지) */
export const DEPOSIT_RATE = 0.5;

/** 청구서 납부기한 기본값 (발행일 + N일) */
export const INVOICE_DUE_DAYS = 7;
