/**
 * RSS/Atom 수집기 — 의존성 없이 정규식 기반 파싱 (RSS 2.0 <item> / Atom <entry>).
 * 소스별 feedCandidates를 순서대로 시도, 최근 windowHours 이내 글만 남긴다.
 */

import { NEWS_SOURCES, type NewsSource } from "@/lib/daily-report/sources";

export interface CollectedItem {
  source: string; // 소스 이름
  sourceKey: string;
  group: string;
  cadence: "daily" | "weekly";
  title: string;
  link: string;
  publishedAt: string; // ISO
  summary: string;
}

export interface CollectFailure {
  source: string;
  url: string; // 사람이 직접 열어볼 목록 페이지
  reason: string;
}

export interface CollectResult {
  items: CollectedItem[];
  failures: CollectFailure[];
  windowHours: number;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 OptifyDailyReport/1.0";

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function firstMatch(block: string, patterns: RegExp[]): string {
  for (const p of patterns) {
    const m = block.match(p);
    if (m?.[1]) return m[1];
  }
  return "";
}

interface RawItem {
  title: string;
  link: string;
  date: Date | null;
  summary: string;
}

/** RSS <item> + Atom <entry> 블록 파싱 */
function parseFeed(xml: string): RawItem[] {
  const blocks = [
    ...(xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? []),
    ...(xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) ?? []),
  ];
  return blocks.map((b) => {
    const title = stripTags(
      firstMatch(b, [/<title[^>]*>([\s\S]*?)<\/title>/]),
    );
    // Atom은 <link href="..."/>, RSS는 <link>...</link>
    const link = decodeEntities(
      firstMatch(b, [
        /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/,
        /<link[^>]*href=["']([^"']+)["']/,
        /<link[^>]*>([\s\S]*?)<\/link>/,
      ]),
    ).trim();
    const dateStr = firstMatch(b, [
      /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/,
      /<published[^>]*>([\s\S]*?)<\/published>/,
      /<updated[^>]*>([\s\S]*?)<\/updated>/,
      /<dc:date[^>]*>([\s\S]*?)<\/dc:date>/,
    ]);
    const parsed = dateStr ? new Date(stripTags(dateStr)) : null;
    const summary = stripTags(
      firstMatch(b, [
        /<description[^>]*>([\s\S]*?)<\/description>/,
        /<summary[^>]*>([\s\S]*?)<\/summary>/,
        /<content[^>]*>([\s\S]*?)<\/content>/,
      ]),
    ).slice(0, 300);
    return {
      title,
      link,
      date: parsed && !isNaN(parsed.getTime()) ? parsed : null,
      summary,
    };
  });
}

async function fetchFeed(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    // HTML이 오면 피드가 아님
    if (!/<rss|<feed|<rdf/i.test(text.slice(0, 500))) return null;
    return text;
  } catch {
    return null;
  }
}

async function collectSource(
  src: NewsSource,
  since: Date,
): Promise<{ items: CollectedItem[]; failure?: CollectFailure }> {
  let xml: string | null = null;
  for (const candidate of src.feedCandidates) {
    xml = await fetchFeed(candidate);
    if (xml) break;
  }
  if (!xml) {
    return {
      items: [],
      failure: { source: src.name, url: src.url, reason: "피드 없음/차단 — 직접 확인" },
    };
  }
  const cap = src.cadence === "daily" ? 6 : 3;
  const items = parseFeed(xml)
    .filter((r) => r.title && r.link && r.date && r.date >= since)
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, cap)
    .map((r) => ({
      source: src.name,
      sourceKey: src.key,
      group: src.group,
      cadence: src.cadence,
      title: r.title,
      link: r.link,
      publishedAt: r.date!.toISOString(),
      summary: r.summary,
    }));
  return { items };
}

/** 전 소스 병렬 수집. windowHours 이내 글만. */
export async function collectNews(windowHours: number): Promise<CollectResult> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const results = await Promise.all(
    NEWS_SOURCES.map((src) => collectSource(src, since)),
  );
  const items = results.flatMap((r) => r.items);
  const failures = results
    .map((r) => r.failure)
    .filter((f): f is CollectFailure => !!f);
  // 매일 소스 먼저, 그다음 최신순
  items.sort((a, b) => {
    if (a.cadence !== b.cadence) return a.cadence === "daily" ? -1 : 1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
  return { items, failures, windowHours };
}
