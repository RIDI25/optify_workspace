/**
 * 스크리밍프로그 Internal All CSV 파서 + 사이트 전체 이슈 추출.
 * 기준 파일: UTF-8(BOM) · 영문 헤더 72컬럼 · HTML 외 리소스(이미지/JS/CSS) 행 포함.
 */

import type { SiteWideIssues } from "@/lib/seo-audit/types";

/** 따옴표 내 쉼표·이스케이프("")를 처리하는 CSV 파서 (상태 기계) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // BOM 제거
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

export interface SfRow {
  address: string;
  contentType: string;
  statusCode: string;
  indexability: string;
  title: string;
  titleLength: number;
  metaDescription: string;
  h1: string;
  canonical: string;
  wordCount: number;
  crawlDepth: number;
  responseTime: number;
  redirectUrl: string;
}

/** 헤더 행을 찾아 필요한 컬럼만 구조화. 컬럼이 없으면 빈 값으로 (SF 버전 차이 허용) */
export function parseScreamingFrog(csvText: string): SfRow[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);
  const idx = {
    address: col("Address"),
    contentType: col("Content Type"),
    statusCode: col("Status Code"),
    indexability: col("Indexability"),
    title: col("Title 1"),
    titleLength: col("Title 1 Length"),
    metaDescription: col("Meta Description 1"),
    h1: col("H1-1"),
    canonical: col("Canonical Link Element 1"),
    wordCount: col("Word Count"),
    crawlDepth: col("Crawl Depth"),
    responseTime: col("Response Time"),
    redirectUrl: col("Redirect URL"),
  };
  if (idx.address < 0 || idx.contentType < 0 || idx.statusCode < 0) return [];

  const get = (r: string[], i: number) => (i >= 0 && r[i] != null ? r[i] : "");
  return rows.slice(1).map((r) => ({
    address: get(r, idx.address),
    contentType: get(r, idx.contentType),
    statusCode: get(r, idx.statusCode),
    indexability: get(r, idx.indexability),
    title: get(r, idx.title),
    titleLength: Number(get(r, idx.titleLength)) || 0,
    metaDescription: get(r, idx.metaDescription),
    h1: get(r, idx.h1),
    canonical: get(r, idx.canonical),
    wordCount: Number(get(r, idx.wordCount)) || 0,
    crawlDepth: Number(get(r, idx.crawlDepth)) || 0,
    responseTime: Number(get(r, idx.responseTime)) || 0,
    redirectUrl: get(r, idx.redirectUrl),
  }));
}

const THIN_WORDS = 300;
const SLOW_SECONDS = 2;
const DEEP_DEPTH = 4;
const LIST_CAP = 30; // 리포트에 담을 목록 상한

export function extractSiteWideIssues(rows: SfRow[]): SiteWideIssues {
  const isHtml = (r: SfRow) => r.contentType.startsWith("text/html");
  const html = rows.filter((r) => isHtml(r) && r.statusCode === "200");

  const titleGroups = new Map<string, string[]>();
  for (const r of html) {
    const t = r.title.trim();
    if (!t) continue;
    titleGroups.set(t, [...(titleGroups.get(t) ?? []), r.address]);
  }

  return {
    totalUrls: rows.length,
    htmlPages: html.length,
    resources: {
      images: rows.filter((r) => r.contentType.startsWith("image/")).length,
      scripts: rows.filter((r) => r.contentType.includes("javascript")).length,
      styles: rows.filter((r) => r.contentType.startsWith("text/css")).length,
    },
    notFound: rows.filter((r) => r.statusCode === "404").map((r) => r.address).slice(0, LIST_CAP),
    redirects: rows
      .filter((r) => r.statusCode.startsWith("3") && r.redirectUrl)
      .map((r) => ({ from: r.address, to: r.redirectUrl }))
      .slice(0, LIST_CAP),
    duplicateTitles: [...titleGroups.entries()]
      .filter(([, urls]) => urls.length > 1)
      .map(([title, urls]) => ({ title, count: urls.length, urls: urls.slice(0, 10) }))
      .slice(0, LIST_CAP),
    missingTitle: html.filter((r) => !r.title.trim()).map((r) => r.address).slice(0, LIST_CAP),
    missingMeta: html
      .filter((r) => !r.metaDescription.trim())
      .map((r) => r.address)
      .slice(0, LIST_CAP),
    missingH1: html.filter((r) => !r.h1.trim()).map((r) => r.address).slice(0, LIST_CAP),
    missingCanonical: html
      .filter((r) => !r.canonical.trim())
      .map((r) => r.address)
      .slice(0, LIST_CAP),
    thinContent: html
      .filter((r) => r.wordCount > 0 && r.wordCount < THIN_WORDS)
      .map((r) => ({ url: r.address, words: r.wordCount }))
      .slice(0, LIST_CAP),
    slowPages: html
      .filter((r) => r.responseTime >= SLOW_SECONDS)
      .map((r) => ({ url: r.address, seconds: r.responseTime }))
      .slice(0, LIST_CAP),
    deepPages: html
      .filter((r) => r.crawlDepth >= DEEP_DEPTH)
      .map((r) => ({ url: r.address, depth: r.crawlDepth }))
      .slice(0, LIST_CAP),
  };
}

/** finalUrl에 해당하는 크롤 행 찾기 (trailing slash 무시) */
export function findRowForUrl(rows: SfRow[], url: string): SfRow | null {
  const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  const target = norm(url);
  return rows.find((r) => norm(r.address) === target) ?? null;
}
