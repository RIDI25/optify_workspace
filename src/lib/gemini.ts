import { GoogleGenAI } from "@google/genai";

/** Gemini 이미지 생성 모델 (generateContent + responseModalities: ["IMAGE"]) */
export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

export function createGemini() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

/** 프롬프트로 이미지 1장 생성 → 바이너리 + MIME 반환 */
export async function generateImage(
  prompt: string,
): Promise<{ data: Buffer; mime: string }> {
  const ai = createGemini();
  const res = await ai.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: prompt,
    config: { responseModalities: ["IMAGE"] },
  });
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img?.inlineData?.data) {
    throw new Error("이미지 생성 실패 (응답에 이미지 없음)");
  }
  return {
    data: Buffer.from(img.inlineData.data, "base64"),
    mime: img.inlineData.mimeType ?? "image/png",
  };
}
