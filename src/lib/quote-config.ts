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
