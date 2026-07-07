import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchGscSnapshot } from "@/lib/google/gsc";
import { fetchGa4Snapshot } from "@/lib/google/ga4";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GSC + GA4 스냅샷 조회.
 * body: { clientId, yearMonth('YYYY-MM'), startDate?, endDate? ('YYYY-MM-DD') }
 * startDate/endDate를 주면 해당 기간, 없으면 yearMonth 한 달.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, yearMonth, startDate: reqStart, endDate: reqEnd } =
    await req.json();
  if (!clientId || !/^\d{4}-\d{2}$/.test(yearMonth ?? "")) {
    return NextResponse.json(
      { ok: false, error: "clientId, yearMonth('YYYY-MM')가 필요합니다." },
      { status: 400 },
    );
  }

  const { data: client } = await supabase
    .from("clients")
    .select("gsc_site_url, ga4_property_id")
    .eq("id", clientId)
    .single();

  const [y, m] = yearMonth.split("-").map(Number);
  let startDate = `${yearMonth}-01`;
  let endDate = `${yearMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  // 임의 기간 지정 (검증: 형식·순서·최대 1년)
  const isYmd = (s: unknown): s is string =>
    typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (isYmd(reqStart) && isYmd(reqEnd)) {
    if (reqStart > reqEnd) {
      return NextResponse.json(
        { ok: false, error: "시작일이 종료일보다 늦습니다." },
        { status: 400 },
      );
    }
    const span =
      (new Date(reqEnd).getTime() - new Date(reqStart).getTime()) / DAY_MS;
    if (span > 366) {
      return NextResponse.json(
        { ok: false, error: "조회 기간은 최대 1년까지입니다." },
        { status: 400 },
      );
    }
    startDate = reqStart;
    endDate = reqEnd;
  }

  let gsc = null;
  let gscError: string | undefined;
  let ga4 = null;
  let ga4Error: string | undefined;

  if (client?.gsc_site_url) {
    try {
      gsc = await fetchGscSnapshot(client.gsc_site_url, startDate, endDate);
      await logApiUsage({ userId: user.id, clientId, provider: "gsc" });
    } catch (e) {
      gscError = e instanceof Error ? e.message : "GSC 조회 실패";
    }
  } else {
    gscError = "gsc_site_url 미설정 (설정에서 입력)";
  }

  if (client?.ga4_property_id) {
    try {
      ga4 = await fetchGa4Snapshot(client.ga4_property_id, startDate, endDate);
      await logApiUsage({ userId: user.id, clientId, provider: "ga4" });
    } catch (e) {
      ga4Error = e instanceof Error ? e.message : "GA4 조회 실패";
    }
  } else {
    ga4Error = "ga4_property_id 미설정 (설정에서 입력)";
  }

  return NextResponse.json({
    ok: true,
    gsc,
    gscError,
    ga4,
    ga4Error,
    period: { startDate, endDate },
  });
}
