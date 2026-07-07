import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchNaverKeywordIdeas, type NaverKeywordIdea } from "@/lib/naver-ads";
import { generateKeywordIdeas, type KeywordIdea } from "@/lib/google-ads";
import { fetchBlogDocCounts, hasNaverOpenApi } from "@/lib/naver-openapi";
import { logApiUsage } from "@/lib/usage";
import type { KeywordReport } from "@/types/keyword-report";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 네이버는 공백 제거 형태로 키워드를 돌려준다 — 비교용 정규화 */
function norm(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * 키워드 통합 리포트 — 네이버 검색광고 + Google Ads + (선택) 네이버 오픈API 문서량.
 * 한 소스가 실패해도 나머지로 리포트를 구성하고 warnings로 알린다.
 * body: { keyword: string, clientId?: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { keyword, clientId } = await req.json();
  const kw = typeof keyword === "string" ? keyword.trim() : "";
  if (!kw) {
    return NextResponse.json(
      { ok: false, error: "키워드를 입력하세요." },
      { status: 400 },
    );
  }

  const warnings: string[] = [];

  const [naverRes, googleRes] = await Promise.allSettled([
    process.env.NAVER_AD_API_KEY
      ? fetchNaverKeywordIdeas([kw])
      : Promise.reject(new Error("NAVER_AD_API_KEY가 설정되지 않았습니다.")),
    process.env.GOOGLE_ADS_REFRESH_TOKEN
      ? generateKeywordIdeas([kw])
      : Promise.reject(new Error("GOOGLE_ADS_REFRESH_TOKEN이 설정되지 않았습니다.")),
  ]);

  let naverRows: NaverKeywordIdea[] = [];
  if (naverRes.status === "fulfilled") {
    naverRows = naverRes.value;
    await logApiUsage({ userId: user.id, clientId: clientId ?? null, provider: "naver_ads" });
  } else {
    warnings.push(`네이버 조회 실패: ${naverRes.reason instanceof Error ? naverRes.reason.message : String(naverRes.reason)}`);
  }

  let googleRows: KeywordIdea[] = [];
  if (googleRes.status === "fulfilled") {
    googleRows = googleRes.value;
    await logApiUsage({ userId: user.id, clientId: clientId ?? null, provider: "google_ads" });
  } else {
    warnings.push(`구글 조회 실패: ${googleRes.reason instanceof Error ? googleRes.reason.message : String(googleRes.reason)}`);
  }

  if (naverRows.length === 0 && googleRows.length === 0 && warnings.length === 0) {
    warnings.push("두 소스 모두 결과가 없습니다. 더 일반적인 키워드로 시도해보세요.");
  }

  // 네이버: 검색 키워드 본인 vs 연관 분리
  const naverMain = naverRows.find((r) => norm(r.keyword) === norm(kw)) ?? null;
  const naverRelated = naverRows
    .filter((r) => r !== naverMain)
    .sort((a, b) => b.monthlyTotal - a.monthlyTotal)
    .slice(0, 30);

  // 구글: 정확 일치(구글은 소문자 정규화) vs 연관
  const googleMain = googleRows.find((r) => norm(r.keyword) === norm(kw)) ?? null;
  const googleRelated = googleRows
    .filter((r) => r !== googleMain)
    .sort((a, b) => (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0))
    .slice(0, 30)
    // 추이 배열은 메인 키워드만 사용 — 연관은 페이로드에서 제거 (undefined는 JSON 직렬화에서 탈락)
    .map((r) => ({ ...r, monthlySearchVolumes: undefined }));

  // 문서량: 메인 + 네이버 연관 상위 10개
  let docCounts: Record<string, number> | null = null;
  if (hasNaverOpenApi()) {
    const targets = [
      naverMain?.keyword ?? kw,
      ...naverRelated.slice(0, 10).map((r) => r.keyword),
    ];
    docCounts = await fetchBlogDocCounts(targets);
  } else {
    warnings.push(
      "네이버 오픈API 키(NAVER_CLIENT_ID/NAVER_CLIENT_SECRET)가 없어 블로그 문서량을 생략했습니다.",
    );
  }

  const report: KeywordReport = {
    keyword: kw,
    naver: { main: naverMain, related: naverRelated, docCounts },
    google: {
      main: googleMain
        ? { ...googleMain, monthlySearchVolumes: undefined }
        : null,
      related: googleRelated,
      trend: googleMain?.monthlySearchVolumes ?? null,
    },
    warnings,
  };

  return NextResponse.json({ ok: true, report });
}
