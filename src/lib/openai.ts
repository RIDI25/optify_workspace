/**
 * OpenAI 이미지 생성 (카드뉴스 배경용). SDK 없이 fetch 직접 호출.
 * 서버 전용 — OPENAI_API_KEY 환경변수 사용.
 */

export const OPENAI_IMAGE_MODEL = "gpt-image-1";

export function hasOpenAi(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** 프롬프트 → PNG base64. 1024×1024, quality medium */
export async function generateOpenAiImage(prompt: string): Promise<string> {
  if (!hasOpenAi()) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다 (.env.local·Vercel에 추가 필요).");
  }
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: "1024x1024",
      quality: "medium",
      n: 1,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI 이미지 생성 실패 (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI 응답에 이미지가 없습니다.");
  return b64;
}
