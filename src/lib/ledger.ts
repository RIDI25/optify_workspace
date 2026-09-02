/**
 * 회계 장부 레지스트리 — 구분/결제수단/계정 분류 표시 메타.
 * DB(ledger_entries.*)는 text — 하드코딩 enum 금지 원칙. 분류 추가는 여기 한 줄.
 */

export interface LedgerOptionDef {
  key: string;
  label: string;
}

export const ENTRY_TYPES: LedgerOptionDef[] = [
  { key: "income", label: "입금" },
  { key: "expense", label: "지출" },
];

export const PAYMENT_METHODS: LedgerOptionDef[] = [
  { key: "card", label: "카드" },
  { key: "transfer", label: "계좌이체" },
  { key: "cash", label: "현금" },
  { key: "other", label: "기타" },
];

export interface LedgerCategoryDef extends LedgerOptionDef {
  /** 이 분류가 쓰이는 구분 — income/expense/both */
  type: "income" | "expense" | "both";
}

/** 세무 신고에서 흔히 쓰는 계정 분류 (간단 버전) */
export const LEDGER_CATEGORIES: LedgerCategoryDef[] = [
  { key: "sales_income", label: "매출 입금", type: "income" },
  { key: "other_income", label: "기타 입금", type: "income" },
  { key: "labor", label: "인건비·외주비", type: "expense" },
  { key: "ads", label: "광고선전비", type: "expense" },
  { key: "fees", label: "지급수수료·구독료", type: "expense" },
  { key: "comm", label: "통신비", type: "expense" },
  { key: "supplies", label: "소모품·사무용품", type: "expense" },
  { key: "welfare", label: "복리후생비(식대 등)", type: "expense" },
  { key: "travel", label: "여비교통비", type: "expense" },
  { key: "entertain", label: "접대비", type: "expense" },
  { key: "rent", label: "임차료·관리비", type: "expense" },
  { key: "tax", label: "세금과공과", type: "expense" },
  { key: "insurance", label: "보험료", type: "expense" },
  { key: "etc", label: "기타", type: "both" },
];

const find = (defs: LedgerOptionDef[], key: string) =>
  defs.find((d) => d.key === key);

export const entryTypeLabel = (key: string) =>
  find(ENTRY_TYPES, key)?.label ?? key;
export const paymentMethodLabel = (key: string) =>
  find(PAYMENT_METHODS, key)?.label ?? key;
export const ledgerCategoryLabel = (key: string) =>
  find(LEDGER_CATEGORIES, key)?.label ?? key;

/** 구분에 맞는 분류 목록 (폼 select용) */
export const categoriesFor = (entryType: string) =>
  LEDGER_CATEGORIES.filter((c) => c.type === "both" || c.type === entryType);
