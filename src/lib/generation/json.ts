/**
 * LLM이 반환한 텍스트에서 JSON을 안전하게 파싱.
 * 코드블록 마커 제거 → 그대로 파싱 시도 → 문자열 내부 제어문자 이스케이프 후 재시도.
 */
function stripCodeBlock(raw: string): string {
  const t = raw.trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  return m ? m[1].trim() : t;
}

function sanitize(raw: string): string {
  let text = stripCodeBlock(raw);
  // 문자열 값 내부의 실제 줄바꿈/탭을 이스케이프 시퀀스로 변환
  text = text.replace(/"((?:[^"\\]|\\.)*)"/g, (_m, inner: string) => {
    const escaped = inner
      .replace(/(?<!\\)\n/g, "\\n")
      .replace(/(?<!\\)\r/g, "\\r")
      .replace(/(?<!\\)\t/g, "\\t");
    return `"${escaped}"`;
  });
  return text;
}

export function robustJsonParse<T = unknown>(rawText: string): T | null {
  try {
    return JSON.parse(stripCodeBlock(rawText)) as T;
  } catch {
    // 정제 후 재시도
  }
  try {
    return JSON.parse(sanitize(rawText)) as T;
  } catch {
    return null;
  }
}
