import { brandRulesBlock } from "@/lib/generation/brand-rules";
import { businessContextBlock } from "@/lib/generation/business-context";
import { naverCategoryPromptBlock } from "@/lib/naver-categories";

export interface GenerateInput {
  channel: string;
  preset: Record<string, unknown>;
  /** 스레드 등 유형 기반 채널의 content_type. 'auto'면 모델이 적합 유형 선택 */
  contentType?: string | null;
  topic: string;
  extraInstructions?: string;
  /** 옵티파이(is_internal) 클라이언트일 때만 사업 컨텍스트를 주입 */
  isInternalClient?: boolean;
  /** 네이버 블로그 카테고리 key. 'auto'면 모델이 선택해 마커로 알린다 */
  naverCategory?: string | null;
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
  if (input.isInternalClient) parts.push(businessContextBlock());

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
    parts.push(naverCategoryPromptBlock(input.naverCategory));
    parts.push(
      [
        "[네이버 마무리 규칙]",
        "  - 마무리는 핵심 요약으로만 끝내세요. 회사 소개, CTA, 홍보 문구를 생성하지 마세요 (사용자가 별도로 추가합니다).",
        "  - 특정 직군(대표님 등)을 호명하지 말고 범용 독자 대상으로 편하게 쓰세요.",
        "",
        "[네이버 어미 리듬]",
        "  - '~합니다' 체와 '~인데요/~해요' 체를 혼합해 리듬을 만드세요. 정보 전달·설명·단정은 '~합니다/~입니다'로, 말 걸기·부연·전환은 '~인데요/~해보세요/~있어요'로 푸세요.",
        "  - 같은 어미를 3문장 연속으로 쓰지 마세요.",
        "  - 워드프레스보다 가볍고 친근하게, 다만 전부 구어로 풀지는 마세요.",
        "  - 출력 전 어미 리듬을 점검해 '~요'가 연속되는 구간이 있으면 일부를 '~합니다' 체로 교체하세요.",
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
  isInternalClient?: boolean;
}): { system: string; user: string } {
  const system = [
    brandRulesBlock(),
    input.isInternalClient ? businessContextBlock() : "",
    "당신은 옵티파이(검색 마케팅 회사)의 워드프레스 SEO 블로그 작가입니다. 아래 채널 프리셋을 철저히 준수하세요.",
    renderPreset(input.preset),
    [
      "[어미 리듬 — 문체]",
      "  - '~합니다/~입니다' 체를 기본으로 하되, '~해요/~인데요/~죠' 체를 자연스럽게 섞어 리듬을 만드세요. 정보 전달·단정·설명은 '~합니다/~입니다'로, 말 걸기·부연·전환·공감은 '~해요/~인데요/~죠'로 푸세요.",
      "  - 같은 어미를 3문장 연속으로 쓰지 마세요.",
      "  - 보고서식 딱딱한 문어체로만 채우지 마세요. 전문가가 옆에서 상담하듯 편하게 설명하는 톤 — 신뢰감은 유지하되 경직되지 않게.",
      "  - FAQ의 answer에도 동일한 어미 리듬을 적용하세요.",
      "  - 출력 전 점검: 문어체·번역투 문장이 연속되는 구간이 있으면 일부를 구어형 어미로 교체하세요.",
    ].join("\n"),
    [
      "[출력 형식 — 반드시 유효한 JSON 객체 하나만 출력. 코드블록·설명 문구 금지]",
      "{",
      '  "content_html": "본문 전체를 유효한 HTML로. h2/h3/p/ul/li/table/strong 사용. 이미지 태그는 넣지 말 것(이미지는 후처리로 삽입). 첫 200단어 안에 핵심 질문 직접 답변(두괄식).",',
      '  "meta_description": "150자 내외 메타 디스크립션",',
      '  "slug": "영문 소문자 하이픈 슬러그",',
      '  "faq": [{ "question": "...", "answer": "두괄식 답변" }],  // 3~6개',
      `  "image_prompts": [{ "prompt": "영문 이미지 생성 프롬프트 — 아래 [이미지 프롬프트 작성 규칙] 준수", "title": "메인 키워드·주제에 맞는 간결한 한국어 이미지 제목", "alt_text": "메인 키워드를 포함한 한국어 alt 텍스트", "filename": "메인 키워드 기반 영문 슬러그 + 2자리 순번, 예: dermatology-seo-guide-01.png" }]  // ${input.imageCount}개`,
      "}",
      `  - image_prompts는 정확히 ${input.imageCount}개. filename은 서로 다른 순번(-01, -02 …)으로.`,
      "  - title·alt_text·filename에는 반드시 메인 키워드가 포함되어야 합니다. title은 이미지가 놓일 본문 맥락을 반영해 서로 다르게.",
      "",
      "[이미지 프롬프트 작성 규칙]",
      "  - 각 prompt는 영어 60~100단어의 상세 묘사로 작성: ①피사체와 행위(구체적으로 — 인물이면 연령대·복장·표정·동작까지) ②배경/장소(한국의 병원 로비, 상담실, 카페, 도시 거리 등 구체 공간) ③구도와 카메라(over-the-shoulder, close-up, wide shot, low angle, 35mm lens, shallow depth of field 등) ④조명(soft window light, golden hour, warm ambient 등) ⑤분위기와 색감(color palette, mood).",
      `  - ${input.imageCount}개의 프롬프트는 서로 확연히 달라야 합니다: 장면·피사체·구도·조명을 모두 다르게. 같은 구도의 변형 금지.`,
      "  - 각 이미지는 배치될 본문 섹션의 내용을 시각적으로 은유하거나 보여줘야 합니다 (첫 번째는 글 전체 주제의 대표 이미지/썸네일).",
      "  - 클리셰 금지: '책상 위 노트북', '악수하는 비즈니스맨', '허공의 그래프' 같은 뻔한 스톡사진 구도를 반복하지 마세요. 실제 현장감 있는 장면(진료 상담, 매장 앞, 간판, 스마트폰으로 검색하는 손님 등)을 우선하세요.",
      "  - 한국 로컬 비즈니스 맥락을 반영하세요 (Korean people, Korean city street, Korean clinic interior 등).",
      "  - 이미지 안에 텍스트·글자·간판 문구·워터마크·로고가 보이면 안 됩니다 (no text, no letters).",
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
    "각 항목 형식: { \"prompt\": \"영어 60~100단어 상세 묘사\", \"title\": \"메인 키워드·주제에 맞는 간결한 한국어 이미지 제목\", \"alt_text\": \"메인 키워드를 포함한 한국어 설명\", \"filename\": \"메인 키워드 영문 슬러그 + 2자리 순번 + .png\" }",
    `정확히 ${input.count}개. filename 순번은 -01, -02 …로 서로 다르게. title·alt_text·filename에는 반드시 메인 키워드 포함.`,
    "",
    "[prompt 작성 규칙]",
    "- 영어 60~100단어. 다음 5요소를 모두 담아 상세하게: ①피사체와 행위(인물이면 연령대·복장·표정·동작까지 구체적으로) ②배경/장소(한국의 병원 로비, 상담실, 매장, 도시 거리 등 구체 공간) ③구도와 카메라(over-the-shoulder, close-up, wide establishing shot, low angle, 35mm lens, shallow depth of field 등) ④조명(soft window light, golden hour, warm ambient 등) ⑤분위기와 색감.",
    "- 프롬프트끼리 서로 확연히 다르게: 장면·피사체·구도·조명을 모두 다르게 구성. 같은 구도의 변형 금지.",
    "- 각 이미지는 해당 [이미지: 설명] 위치의 본문 내용을 시각적으로 표현해야 한다.",
    "- 클리셰 금지: '책상 위 노트북', '악수하는 비즈니스맨', '허공의 그래프' 같은 뻔한 스톡사진 구도 반복 금지. 실제 현장감 있는 장면을 우선.",
    "- 한국 로컬 비즈니스 맥락 반영 (Korean people, Korean city street, Korean clinic interior 등).",
    "- 사진풍(photorealistic). 이미지 안에 텍스트·글자·간판 문구·워터마크·로고 없음.",
  ].join("\n");
  const user = `메인 키워드: ${input.keyword}\n\n본문:\n${input.body}`;
  return { system, user };
}

/**
 * 저장된 키워드 → 채널별 콘텐츠 주제(제목안) 제안 프롬프트.
 * 해당 클라이언트·채널의 페르소나·타겟 독자를 반영해 실제 그 채널에 맞는 주제가 나오게 한다.
 */
export function buildTopicsPrompt(input: {
  channel: string;
  preset: Record<string, unknown>;
  keywords: string[];
  isInternalClient?: boolean;
}): { system: string; user: string } {
  const persona = String(input.preset.persona ?? "");
  const target = String(input.preset.target_reader ?? "일반 독자");
  const system = [
    brandRulesBlock(),
    input.isInternalClient ? businessContextBlock() : "",
    `너는 옵티파이의 ${input.channel} 콘텐츠 기획자다.`,
    persona ? `[페르소나]\n  ${persona}` : "",
    `[대상 독자]\n  ${target}`,
    [
      "주어진 키워드들을 소재로, 이 채널·독자에 실제로 맞는 콘텐츠 주제(제목안)를 5~10개 제안한다.",
      "[금지] 과장·단정('~하면 큰일납니다', '무조건', '절대'), 낚시형 반전('~인 줄 알았는데'), 감탄사·물음표 남발, 클릭 유도 상투구('충격', '꿀팁 대방출').",
      "[지향] 검색 의도에 답하는 정보형 제목 — 키워드가 자연스럽게 포함되고, 글이 다루는 내용을 담백하게 예고한다. 질문형은 실제 검색어처럼 자연스러운 경우만.",
      "[예시] 좋음: \"검색 노출 확인 방법, 네이버·구글·AI 한 번에 점검하기\" / 나쁨: \"아직도 광고비만 쓰세요? 대표님이 모르는 충격적인 진실\"",
      input.channel === "wordpress"
        ? "이 채널(워드프레스)은 조금 더 구조적으로 — 필요하면 부제를 콜론(:)으로 붙여도 좋다."
        : "이 채널(네이버)은 조금 더 부드럽게.",
      "근거 없는 수치 금지.",
      '출력은 JSON 배열 문자열만: ["제목1", "제목2", …] (코드블록·설명 금지).',
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
  const user = `키워드:\n${input.keywords.map((k) => `- ${k}`).join("\n")}`;
  return { system, user };
}

/**
 * 채널 프리셋 초안 생성 프롬프트. 참고 자료(기존 글·홈페이지 소개·타겟 설명)를 근거로
 * 옵티파이 프리셋과 동일 스키마의 JSON을 생성. few-shot로 스키마를 고정.
 */
export function buildPresetDraftPrompt(input: {
  channel: string;
  references: { blog?: string; homepage?: string; target?: string };
}): { system: string; user: string } {
  const example = {
    persona: "데이터로 설득하는 검색 마케팅 컨설턴트. 현실 고민에서 출발해 수치와 출처로 논증.",
    target_reader: "전문직·지역 기반 사업자",
    tone_rules: [
      "'~입니다' 체 기본",
      "도입: 인사 없이 독자의 문제 상황 → 수사적 질문 → 예고",
      "핵심 주장에 구체 수치 + 출처. 확인 불가 수치는 [출처 필요]",
    ],
    structure_rules: [
      "H2는 질문형 또는 결론형",
      "첫 200단어 안에 핵심 질문 직접 답변(두괄식)",
      "글 하단 FAQ 3~6개",
    ],
  };
  const system = [
    "너는 검색 마케팅 콘텐츠 전략가다. 고객사 참고 자료를 근거로 해당 채널의 콘텐츠 프리셋 초안을 만든다.",
    "출력은 아래 예시와 '동일한 스키마'의 JSON 하나만(코드블록·설명 금지):",
    "예시(스키마 참고용, 내용 복사 금지):\n" + JSON.stringify(example, null, 2),
    "필드: persona(문자열), target_reader(문자열), tone_rules(문자열 배열 4~6), structure_rules(문자열 배열 4~8).",
    "참고 자료에서 실제 톤·독자·구조를 추론해 그 고객사·채널에 맞게 작성. 근거 없는 수치 생성 금지.",
  ].join("\n\n");
  const user = [
    `채널: ${input.channel}`,
    input.references.homepage ? `[홈페이지 소개]\n${input.references.homepage}` : "",
    input.references.target ? `[타겟 설명]\n${input.references.target}` : "",
    input.references.blog ? `[기존 블로그 글 예시]\n${input.references.blog}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
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
