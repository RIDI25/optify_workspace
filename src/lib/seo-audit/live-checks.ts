/**
 * 라이브 체크 — 대상 사이트를 서버에서 직접 조회해 측정.
 * 스크리밍프로그 무료판이 못 보는 영역(스키마·GEO·OG·robots/sitemap 실시간·속도·네이버 노출) 담당.
 * 모든 개별 체크는 실패해도 전체 진단을 막지 않는다 (null 반환 → skip 처리).
 */

const UA =
  "Mozilla/5.0 (compatible; OptifySEOAudit/1.0; +https://optify.kr) Chrome/120 Safari/537.36";
const FETCH_TIMEOUT = 15_000;

async function fetchText(
  url: string,
  timeout = FETCH_TIMEOUT,
): Promise<{ status: number; finalUrl: string; text: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    });
    const text = await res.text();
    return { status: res.status, finalUrl: res.url || url, text };
  } catch {
    return null;
  }
}

/** HTML에서 <meta> 태그 배열 추출 → name/property별 content 맵 */
function parseMetaTags(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const tags = html.match(/<meta\s[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name =
      tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (name && content != null && !map.has(name)) map.set(name, content);
  }
  return map;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export interface PageAudit {
  status: number;
  finalUrl: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  h1s: string[];
  lang: string | null;
  viewport: boolean;
  favicon: boolean;
  og: { title: boolean; description: boolean; image: boolean };
  naverVerification: boolean;
  googleVerification: boolean;
  images: { total: number; withoutAlt: number };
  schemaTypes: string[]; // ld+json @type 목록
  htmlBytes: number;
}

export async function auditPage(url: string): Promise<PageAudit | null> {
  const res = await fetchText(url);
  if (!res) return null;
  const html = res.text;
  const meta = parseMetaTags(html);

  // ld+json 스키마 수집 (@graph·배열 허용)
  const schemaTypes: string[] = [];
  const ldBlocks =
    html.match(
      /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ) ?? [];
  for (const block of ldBlocks) {
    const body = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const parsed = JSON.parse(body);
      const nodes = Array.isArray(parsed)
        ? parsed
        : parsed["@graph"] && Array.isArray(parsed["@graph"])
          ? parsed["@graph"]
          : [parsed];
      for (const node of nodes) {
        const t = node?.["@type"];
        if (typeof t === "string") schemaTypes.push(t);
        else if (Array.isArray(t)) schemaTypes.push(...t.filter((x) => typeof x === "string"));
      }
    } catch {
      // 파싱 불가 블록은 무시
    }
  }

  const imgTags = html.match(/<img\s[^>]*>/gi) ?? [];
  const withoutAlt = imgTags.filter((t) => {
    const alt = t.match(/\balt\s*=\s*["']([^"']*)["']/i);
    return !alt || !alt[1].trim();
  }).length;

  const h1s = (html.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi) ?? []).map(stripTags).filter(Boolean);

  return {
    status: res.status,
    finalUrl: res.finalUrl,
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null,
    metaDescription: meta.get("description") ?? null,
    canonical:
      html.match(
        /<link\s[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["']/i,
      )?.[1] ??
      html.match(
        /<link\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["']/i,
      )?.[1] ??
      null,
    h1s,
    lang: html.match(/<html[^>]*\blang\s*=\s*["']([^"']+)["']/i)?.[1] ?? null,
    viewport: meta.has("viewport"),
    favicon: /<link\s[^>]*rel\s*=\s*["'][^"']*icon[^"']*["']/i.test(html),
    og: {
      title: meta.has("og:title"),
      description: meta.has("og:description"),
      image: meta.has("og:image"),
    },
    naverVerification: meta.has("naver-site-verification"),
    googleVerification: meta.has("google-site-verification"),
    images: { total: imgTags.length, withoutAlt },
    schemaTypes: [...new Set(schemaTypes)],
    htmlBytes: html.length,
  };
}

export interface InfraAudit {
  https: boolean;
  httpRedirects: boolean | null; // http → https 리다이렉트 여부 (측정 불가 시 null)
  robots: { exists: boolean; blocksAll: boolean; sitemapUrls: string[] } | null;
  sitemap: { exists: boolean; urlCount: number } | null;
  llmsTxt: boolean;
}

export async function auditInfra(finalUrl: string): Promise<InfraAudit> {
  const origin = new URL(finalUrl).origin;
  const host = new URL(finalUrl).host;

  // robots.txt
  let robots: InfraAudit["robots"] = null;
  const robotsRes = await fetchText(`${origin}/robots.txt`, 8_000);
  if (robotsRes) {
    if (robotsRes.status === 200 && !robotsRes.text.trim().startsWith("<")) {
      const lines = robotsRes.text.split("\n").map((l) => l.trim());
      const sitemapUrls = lines
        .filter((l) => /^sitemap:/i.test(l))
        .map((l) => l.replace(/^sitemap:\s*/i, "").trim());
      // User-agent: * 블록에 Disallow: / 가 있는지 (단순 검사)
      const blocksAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*($|\n)/i.test(robotsRes.text);
      robots = { exists: true, blocksAll, sitemapUrls };
    } else {
      robots = { exists: false, blocksAll: false, sitemapUrls: [] };
    }
  }

  // sitemap.xml (robots의 Sitemap 지시 우선, 없으면 /sitemap.xml)
  let sitemap: InfraAudit["sitemap"] = null;
  const sitemapUrl = robots?.sitemapUrls[0] ?? `${origin}/sitemap.xml`;
  const sitemapRes = await fetchText(sitemapUrl, 8_000);
  if (sitemapRes) {
    const isXml =
      sitemapRes.status === 200 &&
      (sitemapRes.text.includes("<urlset") || sitemapRes.text.includes("<sitemapindex"));
    sitemap = {
      exists: isXml,
      urlCount: isXml ? (sitemapRes.text.match(/<loc>/g) ?? []).length : 0,
    };
  }

  // llms.txt (GEO)
  const llmsRes = await fetchText(`${origin}/llms.txt`, 8_000);
  const llmsTxt =
    !!llmsRes && llmsRes.status === 200 && !llmsRes.text.trim().startsWith("<");

  // http → https 리다이렉트
  let httpRedirects: boolean | null = null;
  if (finalUrl.startsWith("https://")) {
    try {
      const res = await fetch(`http://${host}/`, {
        headers: { "User-Agent": UA },
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
      const loc = res.headers.get("location") ?? "";
      httpRedirects = res.status >= 300 && res.status < 400 && loc.startsWith("https://");
    } catch {
      httpRedirects = null;
    }
  }

  return { https: finalUrl.startsWith("https://"), httpRedirects, robots, sitemap, llmsTxt };
}

export interface SpeedAudit {
  performanceScore: number; // 0~100
  lcpSeconds: number | null;
  cls: number | null;
}

/** PageSpeed Insights API (모바일). 키 없으면 무키 호출(저빈도 허용), 실패 시 null */
export async function auditSpeed(url: string): Promise<SpeedAudit | null> {
  try {
    const key = process.env.PAGESPEED_API_KEY;
    const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    api.searchParams.set("url", url);
    api.searchParams.set("strategy", "mobile");
    api.searchParams.set("category", "performance");
    if (key) api.searchParams.set("key", key);
    const res = await fetch(api, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const data = await res.json();
    const lh = data?.lighthouseResult;
    const score = lh?.categories?.performance?.score;
    if (typeof score !== "number") return null;
    const lcp = lh?.audits?.["largest-contentful-paint"]?.numericValue;
    const cls = lh?.audits?.["cumulative-layout-shift"]?.numericValue;
    return {
      performanceScore: Math.round(score * 100),
      lcpSeconds: typeof lcp === "number" ? Math.round(lcp / 100) / 10 : null,
      cls: typeof cls === "number" ? Math.round(cls * 1000) / 1000 : null,
    };
  } catch {
    return null;
  }
}
