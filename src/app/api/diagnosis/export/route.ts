import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { renderDiagnosisPdf } from "@/lib/export/diagnosis-pdf";
import type { DiagnosisResult } from "@/lib/seo-audit/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const BUCKET = "diagnoses";

/**
 * 진단 리포트 PDF → 비공개 Storage + 서명 URL. owner 전용.
 * body: { diagnosisId }
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

  const { diagnosisId } = (await req.json()) as { diagnosisId?: string };
  if (!diagnosisId) {
    return NextResponse.json({ ok: false, error: "diagnosisId 필요" }, { status: 400 });
  }

  try {
    const { data: row, error } = await supabase
      .from("seo_diagnoses")
      .select("*")
      .eq("id", diagnosisId)
      .single();
    if (error || !row) throw error ?? new Error("진단을 찾을 수 없습니다.");

    const result = row.results as unknown as DiagnosisResult;
    const reportDate = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const buffer = await renderDiagnosisPdf(result, row.ai_summary ?? null, reportDate);

    const admin = createAdminClient();
    await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
    const host = new URL(result.finalUrl).hostname;
    const storagePath = `${row.id}/${host}-${reportDate}.pdf`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600, {
        download: `검색노출진단_${host}_${reportDate}.pdf`,
      });

    const files = (Array.isArray(row.exported_files) ? row.exported_files : []).filter(
      (f: { format?: string }) => f.format !== "pdf",
    );
    files.push({ format: "pdf", storage_path: storagePath, exported_at: new Date().toISOString() });
    await supabase.from("seo_diagnoses").update({ exported_files: files }).eq("id", diagnosisId);

    return NextResponse.json({ ok: true, url: signed?.signedUrl ?? null });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "리포트 생성 실패",
    });
  }
}
