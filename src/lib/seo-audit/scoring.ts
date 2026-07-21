/**
 * 진단 오케스트레이터 — 라이브 체크 + 스크리밍프로그 CSV를 병합해
 * 카테고리별 점수·교차 검증·견적 품목 제안을 만든다.
 * quoteItem 문자열은 quote-items.ts 카탈로그의 name과 정확히 일치해야 한다.
 */

import {
  auditInfra,
  auditPage,
  auditSpeed,
  type PageAudit,
} from "@/lib/seo-audit/live-checks";
import {
  extractSiteWideIssues,
  findRowForUrl,
  parseScreamingFrog,
} from "@/lib/seo-audit/screaming-frog";
import { fetchNaverSiteExposure } from "@/lib/naver-openapi";
import type {
  AuditCategory,
  AuditCheck,
  CrossCheckFlag,
  DiagnosisResult,
} from "@/lib/seo-audit/types";

const c = (
  key: string,
  label: string,
  status: AuditCheck["status"],
  detail: string,
  quoteItem?: string,
): AuditCheck => ({ key, label, status, detail, quoteItem });

function categoryScore(checks: AuditCheck[]): number | null {
  const scored = checks.filter((x) => x.status === "pass" || x.status === "warn" || x.status === "fail");
  if (!scored.length) return null;
  const earned = scored.reduce(
    (s, x) => s + (x.status === "pass" ? 1 : x.status === "warn" ? 0.5 : 0),
    0,
  );
  return Math.round((earned / scored.length) * 100);
}

export async function runDiagnosis(url: string, csvText?: string | null): Promise<DiagnosisResult> {
  const page = await auditPage(url);
  if (!page) {
    throw new Error("사이트에 접속할 수 없습니다. URL을 확인해 주세요.");
  }
  const finalUrl = page.finalUrl;
  const host = new URL(finalUrl).hostname.replace(/^www\./, "");

  const [infra, speed, naver] = await Promise.all([
    auditInfra(finalUrl),
    auditSpeed(finalUrl),
    fetchNaverSiteExposure(host),
  ]);

  // ── 기본 SEO (홈 기준 라이브) ─────────────────────────────
  const basic: AuditCheck[] = [];
  const title = page.title ?? "";
  basic.push(
    !title
      ? c("title", "타이틀", "fail", "타이틀 태그가 없습니다.", "메타태그 최적화")
      : title.length < 10 || title.length > 45
        ? c("title", "타이틀", "warn", `길이 ${title.length}자 — 10~45자 권장. "${title.slice(0, 40)}"`, "메타태그 최적화")
        : c("title", "타이틀", "pass", `"${title.slice(0, 50)}" (${title.length}자)`),
  );
  const md = page.metaDescription ?? "";
  basic.push(
    !md
      ? c("meta_description", "메타 디스크립션", "fail", "메타 디스크립션이 없습니다.", "메타태그 최적화")
      : md.length < 50 || md.length > 160
        ? c("meta_description", "메타 디스크립션", "warn", `길이 ${md.length}자 — 50~160자 권장.`, "메타태그 최적화")
        : c("meta_description", "메타 디스크립션", "pass", `${md.length}자 작성됨.`),
  );
  basic.push(
    page.h1s.length === 1
      ? c("h1", "H1 제목", "pass", `"${page.h1s[0].slice(0, 50)}"`)
      : page.h1s.length === 0
        ? c("h1", "H1 제목", "fail", "H1이 없습니다.", "온페이지 SEO")
        : c("h1", "H1 제목", "warn", `H1이 ${page.h1s.length}개 — 페이지당 1개 권장.`, "온페이지 SEO"),
  );
  basic.push(
    page.canonical
      ? c("canonical", "캐노니컬", "pass", page.canonical)
      : c("canonical", "캐노니컬", "warn", "canonical 태그가 없습니다.", "온페이지 SEO"),
  );
  basic.push(
    page.viewport
      ? c("viewport", "모바일 뷰포트", "pass", "viewport 메타 있음.")
      : c("viewport", "모바일 뷰포트", "fail", "viewport 메타가 없어 모바일 최적화가 안 됩니다.", "반응형(모바일) 최적화"),
  );
  basic.push(
    page.lang?.toLowerCase().startsWith("ko")
      ? c("lang", "언어 선언", "pass", `lang="${page.lang}"`)
      : c("lang", "언어 선언", "warn", page.lang ? `lang="${page.lang}" — 한국어 사이트면 ko 권장.` : "html lang 속성이 없습니다.", "온페이지 SEO"),
  );
  const { total: imgTotal, withoutAlt } = page.images;
  basic.push(
    imgTotal === 0
      ? c("img_alt", "이미지 alt", "info", "홈에 이미지 태그가 없습니다.")
      : withoutAlt === 0
        ? c("img_alt", "이미지 alt", "pass", `이미지 ${imgTotal}개 모두 alt 있음.`)
        : withoutAlt / imgTotal > 0.3
          ? c("img_alt", "이미지 alt", "fail", `이미지 ${imgTotal}개 중 ${withoutAlt}개 alt 누락.`, "온페이지 SEO")
          : c("img_alt", "이미지 alt", "warn", `이미지 ${imgTotal}개 중 ${withoutAlt}개 alt 누락.`, "온페이지 SEO"),
  );
  basic.push(
    page.favicon
      ? c("favicon", "파비콘", "pass", "파비콘 링크 있음.")
      : c("favicon", "파비콘", "warn", "파비콘이 선언되지 않았습니다."),
  );

  // ── 검색엔진·색인 ─────────────────────────────────────────
  const indexing: AuditCheck[] = [];
  indexing.push(
    infra.https
      ? c("https", "HTTPS", "pass", "보안 연결(HTTPS) 사용 중.")
      : c("https", "HTTPS", "fail", "HTTPS가 아닙니다 — 검색 노출·신뢰도에 불리합니다.", "SSL 인증서 설치"),
  );
  if (infra.httpRedirects != null) {
    indexing.push(
      infra.httpRedirects
        ? c("http_redirect", "HTTP→HTTPS 리다이렉트", "pass", "http 접속이 https로 이동합니다.")
        : c("http_redirect", "HTTP→HTTPS 리다이렉트", "warn", "http 접속이 https로 리다이렉트되지 않습니다.", "SSL 인증서 설치"),
    );
  }
  indexing.push(
    !infra.robots?.exists
      ? c("robots", "robots.txt", "fail", "robots.txt가 없습니다.", "사이트맵·robots.txt 세팅")
      : infra.robots.blocksAll
        ? c("robots", "robots.txt", "fail", "robots.txt가 전체 크롤링을 차단하고 있습니다!", "사이트맵·robots.txt 세팅")
        : c("robots", "robots.txt", "pass", infra.robots.sitemapUrls.length ? "존재, Sitemap 지시 포함." : "존재 (Sitemap 지시는 없음)."),
  );
  indexing.push(
    infra.sitemap?.exists
      ? c("sitemap", "사이트맵", "pass", `sitemap 확인 — URL ${infra.sitemap.urlCount}개.`)
      : c("sitemap", "사이트맵", "fail", "sitemap.xml을 찾을 수 없습니다.", "사이트맵·robots.txt 세팅"),
  );
  indexing.push(
    page.naverVerification
      ? c("naver_verify", "네이버 서치어드바이저", "pass", "사이트 소유 확인 메타 있음.")
      : c("naver_verify", "네이버 서치어드바이저", "fail", "소유 확인 흔적이 없습니다 — 네이버 등록이 안 됐을 가능성.", "검색엔진 등록"),
  );
  indexing.push(
    page.googleVerification
      ? c("google_verify", "구글 서치콘솔", "pass", "사이트 소유 확인 메타 있음.")
      : c("google_verify", "구글 서치콘솔", "info", "소유 확인 메타 없음 (DNS 인증일 수 있어 참고용).", "검색엔진 등록"),
  );
  if (naver) {
    indexing.push(
      naver.matched > 0
        ? c("naver_exposure", "네이버 웹문서 노출", "pass", `상위 결과에 자사 도메인 ${naver.matched}건 노출.`)
        : c("naver_exposure", "네이버 웹문서 노출", "fail", "네이버 웹문서 상위 결과에 도메인이 보이지 않습니다.", "검색엔진 등록"),
    );
  } else {
    indexing.push(c("naver_exposure", "네이버 웹문서 노출", "skip", "네이버 오픈API 키 미설정으로 측정 생략."));
  }

  // ── 구조화·GEO ────────────────────────────────────────────
  const structured: AuditCheck[] = [];
  structured.push(
    page.schemaTypes.length
      ? c("schema", "구조화 데이터(스키마)", "pass", `발견: ${page.schemaTypes.join(", ")}`)
      : c("schema", "구조화 데이터(스키마)", "fail", "ld+json 스키마가 없습니다.", "스키마 마크업(구조화 데이터)"),
  );
  const hasLocal = page.schemaTypes.some((t) =>
    ["LocalBusiness", "Organization", "MedicalBusiness", "Dentist", "Physician", "Attorney", "Store"].some((k) =>
      t.includes(k),
    ),
  );
  structured.push(
    hasLocal
      ? c("schema_local", "사업자 스키마", "pass", "Organization/LocalBusiness 계열 스키마 있음.")
      : c("schema_local", "사업자 스키마", "fail", "사업자 정보 스키마(LocalBusiness 등)가 없습니다.", "스키마 마크업(구조화 데이터)"),
  );
  structured.push(
    page.schemaTypes.includes("FAQPage")
      ? c("schema_faq", "FAQ 스키마", "pass", "FAQPage 스키마 있음.")
      : c("schema_faq", "FAQ 스키마", "warn", "FAQ 스키마가 없습니다 — AI 검색 인용에 유리한 요소.", "GEO 구조 최적화"),
  );
  structured.push(
    infra.llmsTxt
      ? c("llms", "llms.txt (GEO)", "pass", "llms.txt 있음 — AI 크롤러 대응 준비됨.")
      : c("llms", "llms.txt (GEO)", "warn", "llms.txt가 없습니다 — AI 검색 대비 요소.", "GEO 구조 최적화"),
  );
  const ogAll = page.og.title && page.og.description && page.og.image;
  structured.push(
    ogAll
      ? c("og", "OG(공유) 태그", "pass", "og:title/description/image 모두 있음.")
      : c("og", "OG(공유) 태그", "warn", `누락: ${[!page.og.title && "og:title", !page.og.description && "og:description", !page.og.image && "og:image"].filter(Boolean).join(", ")}`, "메타태그 최적화"),
  );

  // ── 콘텐츠·사이트 구조 (스크리밍프로그 CSV) ────────────────
  const content: AuditCheck[] = [];
  let siteWide: DiagnosisResult["siteWide"] = null;
  const crossChecks: CrossCheckFlag[] = [];

  if (csvText?.trim()) {
    const rows = parseScreamingFrog(csvText);
    if (rows.length) {
      siteWide = extractSiteWideIssues(rows);
      const sw = siteWide;
      content.push(
        sw.notFound.length
          ? c("sw_404", "깨진 페이지(404)", "fail", `${sw.notFound.length}건 — 내부 어딘가에서 링크됨.`, "온페이지 SEO")
          : c("sw_404", "깨진 페이지(404)", "pass", "404 없음."),
      );
      content.push(
        sw.redirects.length
          ? c("sw_redirect", "내부 리다이렉트 링크", "warn", `${sw.redirects.length}건 — 내부링크가 리다이렉트를 거칩니다.`, "온페이지 SEO")
          : c("sw_redirect", "내부 리다이렉트 링크", "pass", "리다이렉트 경유 내부링크 없음."),
      );
      content.push(
        sw.duplicateTitles.length
          ? c("sw_dup_title", "중복 타이틀", "fail", `${sw.duplicateTitles.length}종 — 예: "${sw.duplicateTitles[0].title.slice(0, 40)}" ${sw.duplicateTitles[0].count}회.`, "메타태그 최적화")
          : c("sw_dup_title", "중복 타이틀", "pass", "중복 타이틀 없음."),
      );
      const missing = sw.missingTitle.length + sw.missingMeta.length + sw.missingH1.length;
      content.push(
        missing
          ? c("sw_missing", "타이틀·메타·H1 누락", "fail", `타이틀 ${sw.missingTitle.length} · 메타 ${sw.missingMeta.length} · H1 ${sw.missingH1.length}페이지 누락.`, "메타태그 최적화")
          : c("sw_missing", "타이틀·메타·H1 누락", "pass", "전 페이지 작성됨."),
      );
      const thinRatio = sw.htmlPages ? sw.thinContent.length / sw.htmlPages : 0;
      content.push(
        thinRatio > 0.3
          ? c("sw_thin", "얇은 콘텐츠", "fail", `${sw.htmlPages}페이지 중 ${sw.thinContent.length}개가 300단어 미만 (${Math.round(thinRatio * 100)}%).`, "SEO 콘텐츠 제작")
          : sw.thinContent.length
            ? c("sw_thin", "얇은 콘텐츠", "warn", `${sw.thinContent.length}페이지가 300단어 미만.`, "SEO 콘텐츠 제작")
            : c("sw_thin", "얇은 콘텐츠", "pass", "얇은 페이지 없음."),
      );
      content.push(
        sw.slowPages.length
          ? c("sw_slow", "느린 페이지(2초+)", "warn", `${sw.slowPages.length}건.`, "페이지 속도 최적화")
          : c("sw_slow", "느린 페이지(2초+)", "pass", "응답 지연 페이지 없음."),
      );
      content.push(
        sw.deepPages.length
          ? c("sw_depth", "크롤 깊이(4+)", "warn", `${sw.deepPages.length}페이지가 홈에서 4클릭 이상.`, "온페이지 SEO")
          : c("sw_depth", "크롤 깊이(4+)", "pass", "모든 페이지가 3클릭 이내."),
      );

      // 교차 검증 — 홈 페이지의 크롤 값 vs 라이브 값
      const home = findRowForUrl(rows, finalUrl);
      if (home) {
        const compare = (field: string, crawler: string, live: string) => {
          const norm = (s: string) => s.replace(/\s+/g, " ").trim();
          if (norm(crawler) !== norm(live)) {
            crossChecks.push({
              field,
              crawler: crawler || "(없음)",
              live: live || "(없음)",
              note: "크롤 시점 이후 변경됐거나, 검색엔진이 보는 원본 HTML과 실제 렌더 결과가 다릅니다.",
            });
          }
        };
        compare("타이틀", home.title, page.title ?? "");
        compare("메타 디스크립션", home.metaDescription, page.metaDescription ?? "");
        compare("H1", home.h1, page.h1s[0] ?? "");
        compare("캐노니컬", home.canonical, page.canonical ?? "");
      }
    } else {
      content.push(c("sw_parse", "크롤 파일", "skip", "CSV를 해석하지 못했습니다 — Internal 탭 전체 내보내기인지 확인하세요."));
    }
  } else {
    content.push(c("sw_none", "사이트 전체 분석", "skip", "스크리밍프로그 CSV 미업로드 — 홈 페이지 기준 라이트 진단입니다."));
  }

  // ── 성능 ─────────────────────────────────────────────────
  const performance: AuditCheck[] = [];
  if (speed) {
    performance.push(
      speed.performanceScore >= 90
        ? c("psi", "PageSpeed(모바일)", "pass", `성능 점수 ${speed.performanceScore}점.`)
        : speed.performanceScore >= 50
          ? c("psi", "PageSpeed(모바일)", "warn", `성능 점수 ${speed.performanceScore}점 — 90점 이상 권장.`, "페이지 속도 최적화")
          : c("psi", "PageSpeed(모바일)", "fail", `성능 점수 ${speed.performanceScore}점 — 개선 시급.`, "페이지 속도 최적화"),
    );
    if (speed.lcpSeconds != null) {
      performance.push(
        speed.lcpSeconds <= 2.5
          ? c("lcp", "LCP(최대 콘텐츠 표시)", "pass", `${speed.lcpSeconds}초.`)
          : c("lcp", "LCP(최대 콘텐츠 표시)", speed.lcpSeconds <= 4 ? "warn" : "fail", `${speed.lcpSeconds}초 — 2.5초 이내 권장.`, "페이지 속도 최적화"),
      );
    }
    if (speed.cls != null) {
      performance.push(
        speed.cls <= 0.1
          ? c("cls", "CLS(화면 밀림)", "pass", `${speed.cls}.`)
          : c("cls", "CLS(화면 밀림)", speed.cls <= 0.25 ? "warn" : "fail", `${speed.cls} — 0.1 이하 권장.`, "페이지 속도 최적화"),
      );
    }
  } else {
    performance.push(c("psi", "PageSpeed(모바일)", "skip", "PageSpeed 측정 실패/생략 — 재시도하거나 PAGESPEED_API_KEY를 설정하세요."));
  }

  const categories: AuditCategory[] = [
    { key: "basic", label: "기본 SEO", score: categoryScore(basic), checks: basic },
    { key: "indexing", label: "검색엔진·색인", score: categoryScore(indexing), checks: indexing },
    { key: "structured", label: "구조화·GEO", score: categoryScore(structured), checks: structured },
    { key: "content", label: "콘텐츠·사이트 구조", score: categoryScore(content), checks: content },
    { key: "performance", label: "속도·성능", score: categoryScore(performance), checks: performance },
  ];

  const scored = categories.filter((x) => x.score != null);
  const totalScore = scored.length
    ? Math.round(scored.reduce((s, x) => s + (x.score ?? 0), 0) / scored.length)
    : 0;

  const suggestedItems = [
    ...new Set(
      categories
        .flatMap((cat) => cat.checks)
        .filter((x) => (x.status === "fail" || x.status === "warn") && x.quoteItem)
        .map((x) => x.quoteItem!),
    ),
  ];

  return {
    url,
    finalUrl,
    fetchedAt: new Date().toISOString(),
    pageTitle: page.title,
    totalScore,
    categories,
    siteWide,
    crossChecks,
    suggestedItems,
  };
}
