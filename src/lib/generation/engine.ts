import { brandRulesBlock } from "@/lib/generation/brand-rules";

export interface GenerateInput {
  channel: string;
  preset: Record<string, unknown>;
  /** 스레드 등 유형 기반 채널의 content_type. 'auto'면 모델이 적합 유형 선택 */
  contentType?: string | null;
  topic: string;
  extraInstructions?: string;
}

/** preset의 키를 한글 라벨로 매핑 (표시/프롬프트용) */
const PRESET_LABELS: Record<string, string> = {
  persona: "페르소나",
  target_reader: "대상 독자",
  signature_pattern: "시그니처 패턴",
  tone_rules: "톤 규칙",
  structure_rules: "구조 규칙",
  structure_templates: "유형별 구조 템플릿",
  banned_patterns: "금지 패턴",
};

function renderValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => `  - ${String(v)}`).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `  - ${k}: ${String(v)}`)
      .join("\n");
  }
  return `  ${String(value)}`;
}

/** channel_settings.preset을 읽어 프롬프트 섹션 문자열로 직렬화 (채널 무관, 데이터 기반) */
function renderPreset(preset: Record<string, unknown>): string {
  const blocks: string[] = [];
  for (const [key, value] of Object.entries(preset)) {
    if (value == null) continue;
    const label = PRESET_LABELS[key] ?? key;
    // 유형별 템플릿은 content_type 지정 시 별도 처리하므로 여기선 요약만
    if (key === "structure_templates") continue;
    blocks.push(`[${label}]\n${renderValue(value)}`);
  }
  return blocks.join("\n\n");
}

/** 유형 기반 채널: 선택된 content_type의 구조 템플릿 지시문 */
function renderContentTypeTemplate(
  preset: Record<string, unknown>,
  contentType: string,
): string {
  const templates = preset.structure_templates as
    | Record<string, string>
    | undefined;
  if (!templates) return "";
  if (contentType === "auto" || !templates[contentType]) {
    const list = Object.entries(templates)
      .map(([k, v]) => `  - ${k}: ${v}`)
      .join("\n");
    return `[유형 자동 선택]\n소재에 가장 적합한 유형을 아래에서 스스로 골라 그 구조를 따르세요:\n${list}`;
  }
  return `[선택된 유형: ${contentType}]\n다음 구조를 따르세요: ${templates[contentType]}`;
}

export function buildSystemPrompt(input: GenerateInput): string {
  const parts: string[] = [brandRulesBlock()];

  parts.push(
    "당신은 옵티파이(검색 마케팅 회사)의 콘텐츠 작가입니다. 아래 채널 프리셋을 철저히 준수해 글을 작성하세요.",
  );
  parts.push(`[채널]\n  ${input.channel}`);
  parts.push(renderPreset(input.preset));

  if (input.contentType) {
    const t = renderContentTypeTemplate(input.preset, input.contentType);
    if (t) parts.push(t);
  }

  parts.push(
    [
      "[출력 규칙]",
      "  - 최종 결과물(본문)만 출력하세요. 프리앰블, 메타 설명, '아래는 ~입니다' 같은 안내 문구 금지.",
      "  - 사고 과정이나 선택 이유를 본문에 쓰지 마세요.",
      "  - 근거 없는 통계·수치는 생성하지 마세요.",
      "  - 한국어로 작성하세요.",
    ].join("\n"),
  );

  return parts.filter(Boolean).join("\n\n");
}

export function buildUserPrompt(input: GenerateInput): string {
  const parts = [`주제/소재: ${input.topic}`];
  if (input.extraInstructions?.trim()) {
    parts.push(`추가 지시: ${input.extraInstructions.trim()}`);
  }
  return parts.join("\n\n");
}

/** 부분 수정용 프롬프트 (선택 텍스트 + 지시 → 전체 본문 재작성) */
export function buildRefinePrompt(
  fullBody: string,
  instruction: string,
  selection?: string,
): { system: string; user: string } {
  const system =
    "당신은 옵티파이의 콘텐츠 편집자입니다. 주어진 지시에 따라 본문을 수정하고, 수정된 전체 본문만 출력하세요. 메타 설명 금지.";
  const user = [
    selection ? `수정 대상 부분:\n${selection}\n` : "",
    `수정 지시: ${instruction}`,
    `\n전체 본문:\n${fullBody}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { system, user };
}
