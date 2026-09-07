import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadRunBundle } from "@/lib/tracker-server/load-run";
import { renderTrackerReportPdf } from "@/lib/export/tracker-report-pdf";
import type { TrackingScope } from "@/components/tracking/tracking-view";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 고객사 전달용 측정 리포트 PDF.
 * GET ?clientId=&scope=geo|seo&runId= → application/pdf (측정 1건 + 직전 대비 + 최근 12주 + 최신 추론)
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? "";
  const scope = url.searchParams.get("scope") as TrackingScope;
  const runId = url.searchParams.get("runId");
  if (!clientId || (scope !== "geo" && scope !== "seo")) {
    return NextResponse.json({ ok: false, error: "clientId, scope(geo|seo) 필요" }, { status: 400 });
  }
  const bundle = await loadRunBundle(supabase, clientId, scope, runId);
  if ("error" in bundle) return NextResponse.json({ ok: false, error: bundle.error }, { status: 404 });

  // 이 측정에 대한 최신 추론, 없으면 이 관점의 최신 추론
  const { data: forRun } = await supabase
    .from("tracker_insights")
    .select("insight, created_at")
    .eq("client_id", clientId)
    .eq("scope", scope)
    .eq("run_id", bundle.run.run_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const insight = forRun ? { text: forRun.insight as string, created_at: forRun.created_at as string } : null;

  try {
    const buf = await renderTrackerReportPdf(bundle, insight);
    const date = (bundle.run.started_at ?? new Date().toISOString()).slice(0, 10);
    const name = encodeURIComponent(`${bundle.client.name}_${scope.toUpperCase()}_${date}.pdf`);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${name}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "PDF 생성 실패" }, { status: 500 });
  }
}
