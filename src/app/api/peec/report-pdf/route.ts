import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clampDays, loadPeecSummary, peecRunId } from "@/lib/peec-server";
import { renderPeecReportPdf } from "@/lib/export/peec-report-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 고객사 전달용 GEO 리포트 PDF (Peec AI). GET ?clientId=&days= → application/pdf (그 기간의 최신 추론 포함) */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId 필요" }, { status: 400 });
  const r = await loadPeecSummary(supabase, clientId, clampDays(req.nextUrl.searchParams.get("days")));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status || 502 });
  const { data: ins } = await supabase
    .from("tracker_insights")
    .select("insight, created_at")
    .eq("client_id", clientId)
    .eq("scope", "geo")
    .eq("run_id", peecRunId(r.summary.period))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  try {
    const buf = await renderPeecReportPdf(r.summary, r.client.name, ins ? { text: ins.insight as string, created_at: ins.created_at as string } : null);
    const name = encodeURIComponent(`${r.client.name}_GEO_${r.summary.period.end}.pdf`);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${name}`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "PDF 생성 실패" }, { status: 500 });
  }
}
