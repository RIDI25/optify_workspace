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
      "  - 두괄식으로 쓰되 '결론부터 말씀드리면/말씀드릴게요/결론부터 이야기하면' 처럼 두괄식임을 선언하는 문구는 쓰지 마세요. 답을 그냥 자연스럽게 먼저 서술하세요.",
    ].join("\n"),
  );

  if (input.channel === "naver_blog") {
    parts.push(
      [
        "[네이버 마무리 규칙]",
        "  - 마무리는 핵심 요약으로만 끝내세요. 회사 소개, CTA, 홍보 문구를 생성하지 마세요 (사용자가 별도로 추가합니다).",
        "  - 특정 직군(대표님 등)을 호명하지 말고 범용 독자 대상으로 편하게 쓰세요.",
      ].join("\n"),
    );
  }

  if (input.channel === "threads") {
    parts.push(
      [
        "[자연스러움 검증]",
        "  - 출력 전에 각 문장을 소리 내 읽었을 때 실제 한국인이 스레드에 쓸 법한 문장인지 검증하세요.",
        "  - 번역투·문어체가 섞였으면 실제 통용되는 구어체로 고쳐 쓰세요.",
      ].join("\n"),
    );
  }

  return parts.filter(Boolean).join("\n\n");
}

export function buildUserPrompt(input: GenerateInput): string {
  const parts = [`주제/소재: ${input.topic}`];
  if (input.extraInstructions?.trim()) {
    parts.push(`추가 지시: ${input.extraInstructions.trim()}`);
  }
  return parts.join("\n\n");
}

/**
 * 워드프레스 구조화(JSON) 생성 프롬프트.
 * 결과는 content_html / meta_description / slug / faq[] / image_prompts[]로 구성.
 * image_prompts의 alt_text·filename에는 반드시 메인 키워드가 포함되도록 지시.
 */
export function buildWordpressJsonPrompt(input: {
  preset: Record<string, unknown>;
  topic: string;
  keyword: string;
  extraInstructions?: string;
  imageCount: number;
}): { system: string; user: string } {
  const system = [
    brandRulesBlock(),
    "당신은 옵티파이(검색 마케팅 회사)의 워드프레스 SEO 블로그 작가입니다. 아래 채널 프리셋을 철저히 준수하세요.",
    renderPreset(input.preset),
    [
      "[출력 형식 — 반드시 유효한 JSON 객체 하나만 출력. 코드블록·설명 문구 금지]",
      "{",
      '  "content_html": "본문 전체를 유효한 HTML로. h2/h3/p/ul/li/table/strong 사용. 이미지 태그는 넣지 말 것(이미지는 후처리로 삽입). 첫 200단어 안에 핵심 질문 직접 답변(두괄식).",',
      '  "meta_description": "150자 내외 메타 디스크립션",',
      '  "slug": "영문 소문자 하이픈 슬러그",',
      '  "faq": [{ "question": "...", "answer": "두괄식 답변" }],  // 3~6개',
      `  "image_prompts": [{ "prompt": "영문 이미지 생성 프롬프트(사진풍, 텍스트 없음)", "alt_text": "메인 키워드를 포함한 한국어 alt 텍스트", "filename": "메인 키워드 기반 영문 슬러그 + 2자리 순번, 예: dermatology-seo-guide-01.png" }]  // ${input.imageCount}개`,
      "}",
      `  - image_prompts는 정확히 ${input.imageCount}개. filename은 서로 다른 순번(-01, -02 …)으로.`,
      "  - alt_text와 filename에는 반드시 메인 키워드가 포함되어야 합니다.",
      "  - 근거 없는 통계·수치 금지. 확인 불가한 수치는 [출처 필요]로 표기.",
      "  - 두괄식이되 '결론부터 말씀드리면' 류로 두괄식임을 선언하는 문구 금지 — 답을 자연스럽게 먼저 서술.",
      "  - 분량: 각 H2 섹션 본문 400~600자 이상으로 충실히. content_html 전체(태그 제외) 3,000자 이상 필수. 얕게 끝내지 말 것.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const user = [
    `메인 키워드: ${input.keyword}`,
    `주제: ${input.topic}`,
    input.extraInstructions?.trim() ? `추가 지시: ${input.extraInstructions.trim()}` : "",
    "위 정보로 SEO 최적화 롱폼 블로그를 위 JSON 형식으로 생성하세요.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

/**
 * 본문의 [이미지: 설명] 위치·맥락을 참고해 이미지 생성 프롬프트 배열을 뽑는 프롬프트.
 * 네이버(본문 비삽입, 별도 다운로드용) 등에서 사용.
 */
export function buildImagePromptsPrompt(input: {
  keyword: string;
  body: string;
  count: number;
}): { system: string; user: string } {
  const system = [
    "너는 블로그 이미지 아트디렉터다. 주어진 본문의 [이미지: 설명] 위치와 전체 맥락을 참고해 이미지 생성 프롬프트를 JSON 배열로만 출력한다(코드블록·설명 문구 금지).",
    "각 항목 형식: { \"prompt\": \"영어. 장면·구도·조명·분위기·스타일까지 상세하게. 사진풍(photorealistic). 이미지 안에 텍스트·글자·워터마크·로고 없음\", \"alt_text\": \"메인 키워드를 포함한 한국어 설명\", \"filename\": \"메인 키워드 영문 슬러그 + 2자리 순번 + .png\" }",
    `정확히 ${input.count}개. filename 순번은 -01, -02 …로 서로 다르게. alt_text·filename에는 반드시 메인 키워드 포함.`,
  ].join("\n");
  const user = `메인 키워드: ${input.keyword}\n\n본문:\n${input.body}`;
  return { system, user };
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
