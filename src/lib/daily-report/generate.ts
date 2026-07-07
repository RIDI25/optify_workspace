/** 데일리 리포트 AI 생성 — 수동(버튼)·자동(cron) 공용 */

import { createAnthropic, GENERATION_MODEL } from "@/lib/anthropic";
import { robustJsonParse } from "@/lib/generation/json";
import type { CollectResult } from "@/lib/daily-report/collect";
import type { DailyReportContent } from "@/types/daily-report";

const SYSTEM = [
  "너는 옵티파이(B2B SEO·GEO 마케팅)의 데일리 리포트 애널리스트다. 수집된 최근 SEO·GEO·AI 소식으로 박유리 대표의 아침 브리핑을 한국어로 작성한다.",
  "",
  "## 판단 기준",
  "- 최우선: 구글 알고리즘/스팸 정책 업데이트, AI Overviews·AI Mode 변화, ChatGPT/Claude/Gemini/Perplexity 검색 기능 변화, 대형 데이터 연구(AI 인용 패턴, CTR 변화)",
  "- 우선: 스키마/구조화 데이터, 로컬 SEO, YMYL·E-E-A-T (병의원·법률·세무 클라이언트 직결)",
  "- 제외: 단순 도구 홍보성 글, 근거 없는 예측성 오피니언, 대행사 블로그 재탕",
  "- 수집된 아이템에 있는 내용만 사용. 없는 통계·사실 생성 금지. 통계는 해당 아이템 링크가 원출처일 때만 인용.",
  "",
  "## 소재 채널 분류",
  "- 옵티파이: 사업자가 '맡겨야겠다'고 느낄 소재 — 알고리즘 변화가 병의원·법률·세무 사이트에 미치는 영향, AI 인용 구조, 광고 의존 문제",
  "- 리디웹: 개인이 직접 따라 할 수 있는 소재 — 워드프레스 세팅, 블로그 글쓰기, 애드센스",
  "- 강의·발표: 대규모 데이터 연구, 학술 근거, 시장 전망",
  "",
  "## 출력 (JSON만, 코드블록·설명 금지)",
  `{
  "headlines": ["한 줄 헤드라인 3개"],
  "stories": [{ "title": "", "source": "", "url": "", "what": "무엇이 바뀌었나 1~2문장", "impact": "병의원·법률·세무 클라이언트 영향 1~2문장", "angle": "콘텐츠 소재 활용 각도 1문장" }],
  "suggestions": [{ "channel": "옵티파이|리디웹|강의·발표", "title": "가제 (H2 질문형·두괄식 지침 반영)", "keyword": "타깃 키워드", "reason": "제안 근거 1문장" }],
  "passed": [{ "title": "", "source": "", "reason": "제외 사유 한 줄" }]
}`,
  "- stories 3~5건(중요도순), suggestions 1~2건, headlines 정확히 3개.",
  "- 수집량이 적으면 있는 만큼만. stories에 쓸 게 1건뿐이면 1건만 쓰고 지어내지 않는다.",
  "- passed에는 stories에 넣지 않은 나머지 아이템을 전부 한 줄씩.",
].join("\n");

export interface GeneratedDailyReport {
  report: DailyReportContent;
  inputTokens: number;
  outputTokens: number;
}

/** 수집 결과 → 리포트 JSON. 파싱 실패 시 throw. */
export async function generateDailyReportContent(
  date: string,
  collected: CollectResult,
): Promise<GeneratedDailyReport> {
  const userMsg = [
    `오늘 날짜: ${date} (수집 범위: 최근 ${collected.windowHours}시간)`,
    "",
    "수집된 소식(JSON):",
    JSON.stringify(
      collected.items.map((i) => ({
        source: i.source,
        group: i.group,
        title: i.title,
        url: i.link,
        publishedAt: i.publishedAt,
        summary: i.summary,
      })),
      null,
      1,
    ),
  ].join("\n");

  const anthropic = createAnthropic();
  const msg = await anthropic.messages
    .stream({
      model: GENERATION_MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    })
    .finalMessage();

  const bt = msg.content.find((b) => b.type === "text");
  const report = robustJsonParse<DailyReportContent>(
    bt && bt.type === "text" ? bt.text : "",
  );
  if (!report || !Array.isArray(report.headlines)) {
    throw new Error("리포트 파싱 실패");
  }
  return {
    report,
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
  };
}

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
export function kstToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** KST 기준 월요일이면 72시간(주말 소식 포함), 아니면 48시간 */
export function windowHoursKst(): number {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.getUTCDay() === 1 ? 72 : 48;
}
