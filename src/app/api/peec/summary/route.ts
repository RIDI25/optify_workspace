import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clampDays, loadPeecSummary, peecRunId } from "@/lib/peec-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GEO 탭 — Peec AI 결과 + 그 기간의 최신 추론. GET ?clientId=&days=7|14|30[&refresh=1] */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId 필요" }, { status: 400 });
  const r = await loadPeecSummary(supabase, clientId, clampDays(req.nextUrl.searchParams.get("days")), !!req.nextUrl.searchParams.get("refresh"));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, notLinked: r.notLinked }, { status: r.status });
  const { data: ins } = await supabase
    .from("tracker_insights")
    .select("insight, model, created_at")
    .eq("client_id", clientId)
    .eq("scope", "geo")
    .eq("run_id", peecRunId(r.summary.period))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ ok: true, summary: r.summary, cached: r.cached, insight: ins ?? null });
}
