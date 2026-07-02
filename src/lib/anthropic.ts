import Anthropic from "@anthropic-ai/sdk";

/** 콘텐츠 생성 기본 모델. 날짜 접미사 붙이지 말 것. */
export const GENERATION_MODEL = "claude-opus-4-8";

/** 서버 전용 Anthropic 클라이언트 (ANTHROPIC_API_KEY 환경변수 사용) */
export function createAnthropic() {
  return new Anthropic();
}
