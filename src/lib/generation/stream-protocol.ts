/**
 * 생성 스트림 프로토콜.
 * 서버는 본문 텍스트를 그대로 스트리밍하다가, 마지막에 이 구분자 + JSON 메타를 덧붙인다.
 * 클라이언트는 구분자로 본문과 메타를 분리한다.
 */
export const META_DELIMITER = "\n\x1e__OPTIFY_META__\x1e";

export interface StreamMeta {
  contentId: string | null;
  inputTokens: number;
  outputTokens: number;
  model: string;
  /** 네이버 블로그: 이 글이 들어갈 카테고리 라벨 (선택 또는 모델 자동 판정) */
  naverCategory?: string | null;
  error?: string;
}
