import type { TargetQuestion } from "@/types/tracker";

/**
 * 측정 키워드·질문 (0031 tracker_targets) — 입력 정리·검증. 화면과 테스트가 같이 쓴다.
 * 한도: 메인 5 · 서브 20 · 질문 20. 트래커(tracker/targets.py)도 같은 한도로 다시 확인한다.
 */
export const TARGET_LIMITS = { main: 5, sub: 20, questions: 20 } as const;

/** 질문 의도 (선택). 추천형은 트래커의 '비교추천형', 검색형·빈칸은 트래커가 문장을 보고 정한다 */
export const QUESTION_INTENTS = ["정보형", "지역형", "검색형", "추천형"] as const;
export type QuestionIntent = (typeof QUESTION_INTENTS)[number];

/** 비교용 키: 대소문자·공백 무시 (트래커 textnorm.normalize 와 같은 취지) */
export function targetKey(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/** 한 줄에 하나 → 앞뒤 공백 제거, 빈 줄·중복 제거 */
export function parseLines(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    const k = targetKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export interface TargetsDraft {
  main: string; // textarea (한 줄에 하나)
  sub: string;
  questions: TargetQuestion[];
}

export interface CleanTargets {
  main_keywords: string[];
  sub_keywords: string[];
  questions: TargetQuestion[];
  errors: string[];
}

/** 정리 + 한도 검사. errors 가 비어 있으면 저장 가능 */
export function cleanTargets(d: TargetsDraft): CleanTargets {
  const errors: string[] = [];
  const main = parseLines(d.main);
  const mainKeys = new Set(main.map(targetKey));
  const sub = parseLines(d.sub).filter((s) => !mainKeys.has(targetKey(s)));
  const seenQ = new Set<string>();
  const questions: TargetQuestion[] = [];
  for (const q of d.questions) {
    const text = q.text.trim();
    const k = targetKey(text);
    if (!k || seenQ.has(k)) continue;
    seenQ.add(k);
    const intent = q.intent && (QUESTION_INTENTS as readonly string[]).includes(q.intent) ? q.intent : null;
    questions.push({ text, intent });
  }
  if (main.length > TARGET_LIMITS.main) errors.push(`메인 키워드는 ${TARGET_LIMITS.main}개까지입니다 (지금 ${main.length}개)`);
  if (sub.length > TARGET_LIMITS.sub) errors.push(`서브 키워드는 ${TARGET_LIMITS.sub}개까지입니다 (지금 ${sub.length}개)`);
  if (questions.length > TARGET_LIMITS.questions) errors.push(`질문은 ${TARGET_LIMITS.questions}개까지입니다 (지금 ${questions.length}개)`);
  if (main.length + sub.length === 0 && questions.length === 0) errors.push("키워드나 질문을 하나 이상 적어 주세요");
  return { main_keywords: main, sub_keywords: sub, questions, errors };
}

/** 저장된 행 → 화면 초안 */
export function toDraft(row: { main_keywords: string[]; sub_keywords: string[]; questions: TargetQuestion[] } | null): TargetsDraft {
  return {
    main: (row?.main_keywords ?? []).join("\n"),
    sub: (row?.sub_keywords ?? []).join("\n"),
    questions: (row?.questions ?? []).map((q) => ({ text: q.text, intent: q.intent ?? null })),
  };
}
