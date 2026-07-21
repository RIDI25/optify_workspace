import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSafePublicUrl } from "@/lib/url-guard";
import { runDiagnosis } from "@/lib/seo-audit/scoring";

export const runtime = "nodejs";
export const maxDuration = 120; // PageSpeed 포함 최대 1~2분

/**
 * SEO 진단 실행 + 저장. owner 전용.
 * body: { url, csvText?, leadId? }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "owner") return new NextResponse("Forbidden", { status: 403 });

  const { url, csvText, leadId } = (await req.json()) as {
    url?: string;
    csvText?: string | null;
    leadId?: string | null;
  };
  if (!url?.trim()) {
    return NextResponse.json({ ok: false, error: "URL이 필요합니다." }, { status: 400 });
  }
  const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const guard = isSafePublicUrl(normalized);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: 400 });
  }
  if (csvText && csvText.length > 20_000_000) {
    return NextResponse.json({ ok: false, error: "CSV가 너무 큽니다(20MB 초과)." }, { status: 400 });
  }

  try {
    const result = await runDiagnosis(normalized, csvText);

    const { data: saved, error } = await supabase
      .from("seo_diagnoses")
      .insert({
        url: result.finalUrl,
        lead_id: leadId || null,
        has_csv: !!csvText?.trim(),
        total_score: result.totalScore,
        results: result,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, id: saved.id, result });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "진단 실행 실패",
    });
  }
}
