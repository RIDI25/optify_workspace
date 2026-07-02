/** 모델별 100만 토큰당 단가(USD). api_usage_logs 비용 추정용. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5": { input: 10, output: 50 },
};

/** 이미지 생성 모델: 호출(장)당 고정 단가(USD). [AUDIT M-4]
 *  gemini-2.5-flash-image: 이미지당 1290 출력 토큰 × $30/1M ≈ $0.039 */
const IMAGE_PRICING: Record<string, number> = {
  "gemini-2.5-flash-image": 0.039,
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const perImage = IMAGE_PRICING[model];
  if (perImage != null) return perImage;
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
