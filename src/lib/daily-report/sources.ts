/**
 * 데일리 리포트 모니터링 소스 레지스트리.
 * feedCandidates를 순서대로 시도해 첫 성공 피드를 사용. 전부 실패하면 리포트에
 * "직접 확인" 링크로 표시된다. 소스 목록은 분기별 검토 (2026-07 작성).
 */

export type SourceCadence = "daily" | "weekly";

export interface NewsSource {
  key: string;
  name: string;
  /** 사람이 열어볼 목록 페이지 */
  url: string;
  /** RSS/Atom 후보 URL (순서대로 시도) */
  feedCandidates: string[];
  cadence: SourceCadence;
  group: string; // A. AI 공식 | B. SEO 뉴스 | C. 데이터·연구 | D. GEO 전문
  memo?: string;
}

export const NEWS_SOURCES: NewsSource[] = [
  // ── A. AI 공식 블로그 ──
  {
    key: "anthropic",
    name: "Anthropic News",
    url: "https://www.anthropic.com/news",
    feedCandidates: ["https://www.anthropic.com/news/rss.xml"],
    cadence: "daily",
    group: "A. AI 공식",
    memo: "Claude 검색·인용 발표. GEO 콘텐츠 1차 근거",
  },
  {
    key: "openai",
    name: "OpenAI Blog",
    url: "https://openai.com/news",
    feedCandidates: ["https://openai.com/news/rss.xml"],
    cadence: "daily",
    group: "A. AI 공식",
    memo: "ChatGPT 검색 기능 변화 추적 필수",
  },
  {
    key: "google-search-central",
    name: "Google Search Central",
    url: "https://developers.google.com/search/blog",
    feedCandidates: ["https://feeds.feedburner.com/blogspot/amDG"],
    cadence: "daily",
    group: "A. AI 공식",
    memo: "알고리즘·AI Overviews·스팸 정책 유일 공식 출처",
  },
  {
    key: "deepmind",
    name: "Google DeepMind / Gemini",
    url: "https://blog.google/technology/google-deepmind",
    feedCandidates: ["https://blog.google/technology/google-deepmind/rss/"],
    cadence: "weekly",
    group: "A. AI 공식",
    memo: "Gemini 검색 연동 소식",
  },
  {
    key: "perplexity",
    name: "Perplexity Blog",
    url: "https://www.perplexity.ai/hub",
    feedCandidates: [
      "https://www.perplexity.ai/hub/feed",
      "https://www.perplexity.ai/hub/rss.xml",
    ],
    cadence: "weekly",
    group: "A. AI 공식",
    memo: "AI 검색 UX 변화",
  },

  // ── B. SEO/검색 뉴스 ──
  {
    key: "sel",
    name: "Search Engine Land",
    url: "https://searchengineland.com",
    feedCandidates: ["https://searchengineland.com/feed"],
    cadence: "daily",
    group: "B. SEO 뉴스",
    memo: "업계 표준. 소재 발굴 1순위",
  },
  {
    key: "sej",
    name: "Search Engine Journal",
    url: "https://www.searchenginejournal.com",
    feedCandidates: ["https://www.searchenginejournal.com/feed/"],
    cadence: "daily",
    group: "B. SEO 뉴스",
    memo: "John Mueller 발언, 코어 업데이트 속보",
  },
  {
    key: "seroundtable",
    name: "Search Engine Roundtable",
    url: "https://www.seroundtable.com",
    feedCandidates: [
      "https://feeds.seroundtable.com/SearchEngineRoundtable1",
      "https://www.seroundtable.com/rss.xml",
    ],
    cadence: "daily",
    group: "B. SEO 뉴스",
    memo: "Barry Schwartz 데일리. 업데이트 감지 최속",
  },

  // ── C. 데이터·연구 ──
  {
    key: "semrush",
    name: "Semrush Blog",
    url: "https://www.semrush.com/blog",
    feedCandidates: ["https://www.semrush.com/blog/feed/"],
    cadence: "weekly",
    group: "C. 데이터·연구",
    memo: "AI Overviews 대규모 데이터 연구",
  },
  {
    key: "ahrefs",
    name: "Ahrefs Blog",
    url: "https://ahrefs.com/blog",
    feedCandidates: ["https://ahrefs.com/blog/feed/"],
    cadence: "weekly",
    group: "C. 데이터·연구",
    memo: "대규모 크롤링 기반 연구",
  },
  {
    key: "sparktoro",
    name: "SparkToro",
    url: "https://sparktoro.com/blog",
    feedCandidates: ["https://sparktoro.com/blog/feed/"],
    cadence: "weekly",
    group: "C. 데이터·연구",
    memo: "Rand Fishkin 제로클릭 데이터",
  },
  {
    key: "growth-memo",
    name: "Growth Memo (Kevin Indig)",
    url: "https://www.growth-memo.com",
    feedCandidates: ["https://www.growth-memo.com/feed"],
    cadence: "weekly",
    group: "C. 데이터·연구",
    memo: "AI 검색 vs 오가닉 클릭 데이터",
  },
  {
    key: "seer",
    name: "Seer Interactive",
    url: "https://www.seerinteractive.com/insights",
    feedCandidates: ["https://www.seerinteractive.com/insights/rss.xml"],
    cadence: "weekly",
    group: "C. 데이터·연구",
    memo: "AI Overviews CTR 영향 연구",
  },

  // ── D. GEO 전문 ──
  {
    key: "profound",
    name: "Profound",
    url: "https://www.tryprofound.com/blog",
    feedCandidates: ["https://www.tryprofound.com/blog/rss.xml"],
    cadence: "weekly",
    group: "D. GEO 전문",
    memo: "AI 가시성 트래킹 리서치",
  },
  {
    key: "ipullrank",
    name: "iPullRank (Mike King)",
    url: "https://ipullrank.com/blog",
    feedCandidates: ["https://ipullrank.com/feed/", "https://ipullrank.com/blog/feed/"],
    cadence: "weekly",
    group: "D. GEO 전문",
    memo: "기술적 GEO 최고 권위",
  },
  {
    key: "animalz",
    name: "Animalz",
    url: "https://www.animalz.co/blog",
    feedCandidates: ["https://www.animalz.co/blog/feed/", "https://www.animalz.co/feed/"],
    cadence: "weekly",
    group: "D. GEO 전문",
    memo: "AEO/GEO 콘텐츠 전략",
  },
];
