import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateKeywordHistoricalMetrics } from "@/lib/google-ads";
import { fetchNaverKeywordMetrics } from "@/lib/naver-ads";
import { fetchBlogDocCounts } from "@/lib/naver-openapi";
import { BULK_MAX, type BulkKeywordRow } from "@/lib/keyword-bulk";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * 대량 키워드 검색 지표 조회 (최대 10개). 연관검색어 확장 없음.
 * body: { keywords: string[], clientId? }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { keywords, clientId } = (await req.json()) as {
    keywords?: string[];
    clientId?: string;
  };
  const unique = [
    ...new Map((keywords ?? []).map((k) => [norm(k), k.trim()])).values(),
  ].filter(Boolean);
  if (!unique.length) {
    return NextResponse.json({ ok: false, error: "키워드를 입력하세요." }, { status: 400 });
  }
  if (unique.length > BULK_MAX) {
    return NextResponse.json(
      { ok: false, error: `키워드는 최대 ${BULK_MAX}개까지 조회할 수 있습니다.` },
      { status: 400 },
    );
  }

  try {
    // 세 소스는 서로 다른 API — 병렬 조회, 개별 실패는 해당 컬럼만 비움
    const [googleRes, naverRes, docsRes] = await Promise.allSettled([
      process.env.GOOGLE_ADS_REFRESH_TOKEN
        ? generateKeywordHistoricalMetrics(unique)
        : Promise.resolve([]),
      fetchNaverKeywordMetrics(unique),
      fetchBlogDocCounts(unique),
    ]);

    const google = googleRes.status === "fulfilled" ? googleRes.value : [];
    const naver = naverRes.status === "fulfilled" ? naverRes.value : [];
    const docs = docsRes.status === "fulfilled" ? docsRes.value : {};
    const warnings = [
      googleRes.status === "rejected" && `구글: ${String(googleRes.reason).slice(0, 120)}`,
      naverRes.status === "rejected" && `네이버: ${String(naverRes.reason).slice(0, 120)}`,
    ].filter(Boolean) as string[];

    const rows: BulkKeywordRow[] = unique.map((keyword) => {
      const g = google.find((x) => norm(x.keyword) === norm(keyword));
      const n = naver.find((x) => norm(x.keyword) === norm(keyword));
      const docsEntry = Object.entries(docs).find(([k]) => norm(k) === norm(keyword));
      return {
        keyword,
        google: g
          ? {
              avgMonthlySearches: g.avgMonthlySearches,
              competition: g.competition,
              competitionIndex: g.competitionIndex,
              cpcLow: g.cpcLow,
              cpcHigh: g.cpcHigh,
            }
          : null,
        naver: n
          ? {
              monthlyPc: n.monthlyPc,
              monthlyMobile: n.monthlyMobile,
              monthlyTotal: n.monthlyTotal,
              competition: n.competition,
              avgAdDepth: n.avgAdDepth,
            }
          : null,
        blogDocs: docsEntry ? docsEntry[1] : null,
      };
    });

    if (google.length) {
      await logApiUsage({ userId: user.id, clientId: clientId ?? null, provider: "google_ads" });
    }
    if (naver.length) {
      await logApiUsage({ userId: user.id, clientId: clientId ?? null, provider: "naver_ads" });
    }

    return NextResponse.json({ ok: true, rows, warnings });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "대량 키워드 조회 실패",
    });
  }
}
