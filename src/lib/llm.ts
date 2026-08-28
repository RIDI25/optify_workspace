/**
 * 텍스트 생성 프로바이더 추상화 — 환경변수 하나로 OpenAI ↔ Anthropic 전환.
 *
 *   GENERATION_PROVIDER=openai     → OpenAI Responses API (기본 모델 gpt-5.6-sol)
 *   GENERATION_PROVIDER=anthropic  → Anthropic Fable 5 + 거부 시 Opus 4.8 폴백 (기본)
 *   OPENAI_GENERATION_MODEL        → OpenAI 모델 ID 덮어쓰기 (기본 gpt-5.6-sol)
 *   OPENAI_REASONING_EFFORT        → none|low|medium|high (기본 low — 글쓰기 용도)
 *
 * 모든 생성 경로는 generateText / streamText만 사용한다. SDK 응답 형태를 여기서 통일.
 */

import {
  createAnthropic,
  GENERATION_MODEL,
  GENERATION_BETAS,
  GENERATION_FALLBACKS,
} from "@/lib/anthropic";

export type LlmProvider = "anthropic" | "openai";

export const OPENAI_GENERATION_MODEL =
  process.env.OPENAI_GENERATION_MODEL || "gpt-5.6-sol";

export function generationProvider(): LlmProvider {
  return process.env.GENERATION_PROVIDER === "openai" ? "openai" : "anthropic";
}

/** 현재 프로바이더 기준 모델 ID (사용량 로깅·메타 표기용) */
export function currentGenerationModel(): string {
  return generationProvider() === "openai" ? OPENAI_GENERATION_MODEL : GENERATION_MODEL;
}

export interface LlmInput {
  system: string;
  user: string;
  maxTokens: number;
  /** 비전 입력 (스크린샷 수치 추출 등) */
  image?: { base64: string; mediaType: string };
}

export interface LlmResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  provider: LlmProvider;
  model: string;
}

/** 완성 텍스트 반환 (내부적으로 스트리밍 — 긴 출력의 HTTP 타임아웃 회피) */
export async function generateText(input: LlmInput): Promise<LlmResult> {
  return generationProvider() === "openai"
    ? openaiGenerate(input, null)
    : anthropicGenerate(input, null);
}

/** 델타 콜백으로 스트리밍하고 완성 결과 반환 */
export async function streamText(
  input: LlmInput,
  onDelta: (text: string) => void,
): Promise<LlmResult> {
  return generationProvider() === "openai"
    ? openaiGenerate(input, onDelta)
    : anthropicGenerate(input, onDelta);
}

// ── Anthropic ────────────────────────────────────────────────

type AnthropicImageMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

async function anthropicGenerate(
  input: LlmInput,
  onDelta: ((text: string) => void) | null,
): Promise<LlmResult> {
  const anthropic = createAnthropic();
  const content = input.image
    ? [
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: input.image.mediaType as AnthropicImageMedia,
            data: input.image.base64,
          },
        },
        { type: "text" as const, text: input.user },
      ]
    : input.user;

  const stream = anthropic.beta.messages.stream({
    model: GENERATION_MODEL,
    betas: GENERATION_BETAS,
    fallbacks: GENERATION_FALLBACKS,
    max_tokens: input.maxTokens,
    system: input.system,
    messages: [{ role: "user", content }],
  });

  if (onDelta) {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        onDelta(event.delta.text);
      }
    }
  }
  const msg = await stream.finalMessage();
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");
  return {
    text,
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
    provider: "anthropic",
    model: msg.model ?? GENERATION_MODEL,
  };
}

// ── OpenAI (Responses API, SDK 없이 fetch) ───────────────────

interface OpenAiResponse {
  model?: string;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

function extractOutputText(data: OpenAiResponse): string {
  return (data.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("\n");
}

async function openaiGenerate(
  input: LlmInput,
  onDelta: ((text: string) => void) | null,
): Promise<LlmResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const userInput = input.image
    ? [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: `data:${input.image.mediaType};base64,${input.image.base64}`,
            },
            { type: "input_text", text: input.user },
          ],
        },
      ]
    : input.user;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: OPENAI_GENERATION_MODEL,
      instructions: input.system,
      input: userInput,
      // 추론 토큰도 출력 한도에 포함되므로 여유분 가산
      max_output_tokens: Math.min(input.maxTokens + 4000, 128_000),
      reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || "low" },
      stream: !!onDelta,
    }),
    signal: AbortSignal.timeout(600_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }

  if (!onDelta) {
    const data = (await res.json()) as OpenAiResponse;
    if (data.error?.message) throw new Error(`OpenAI: ${data.error.message}`);
    return {
      text: extractOutputText(data),
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      provider: "openai",
      model: data.model ?? OPENAI_GENERATION_MODEL,
    };
  }

  // SSE 스트림: response.output_text.delta → 델타, response.completed → 사용량
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let model = OPENAI_GENERATION_MODEL;

  const handle = (raw: string) => {
    const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) return;
    const json = dataLine.slice(5).trim();
    if (!json || json === "[DONE]") return;
    let ev: {
      type?: string;
      delta?: string;
      response?: OpenAiResponse;
      error?: { message?: string };
    };
    try {
      ev = JSON.parse(json);
    } catch {
      return;
    }
    if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") {
      text += ev.delta;
      onDelta(ev.delta);
    } else if (ev.type === "response.completed") {
      inputTokens = ev.response?.usage?.input_tokens ?? 0;
      outputTokens = ev.response?.usage?.output_tokens ?? 0;
      model = ev.response?.model ?? model;
    } else if (ev.type === "response.failed" || ev.type === "error") {
      throw new Error(
        `OpenAI 스트림 오류: ${ev.error?.message ?? ev.response?.error?.message ?? "unknown"}`,
      );
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      handle(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
    }
  }
  if (buffer.trim()) handle(buffer);

  return { text, inputTokens, outputTokens, provider: "openai", model };
}
