import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { buildReportModel } from "@/lib/export/report-model";
import { buildDocx } from "@/lib/export/docx-builder";
import { renderReportPdf } from "@/lib/export/report-pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

const BUCKET = "reports";

/**
 * 리포트 PDF/docx 내보내기 → 비공개 Storage 저장 + exported_files 기록 + 서명 URL 반환.
 * body: { clientId, clientName, yearMonth, format('pdf'|'docx'), report, exportedAt }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, clientName, yearMonth, format, report, exportedAt } =
    await req.json();
  if (!clientId || !yearMonth || !["pdf", "docx"].includes(format)) {
    return NextResponse.json(
      { ok: false, error: "clientId, yearMonth, format(pdf|docx) 필요" },
      { status: 400 },
    );
  }

  try {
    const model = buildReportModel(clientName ?? "", yearMonth, report ?? {});
    const isPdf = format === "pdf";
    const buffer = isPdf ? await renderReportPdf(model) : await buildDocx(model);
    const contentType = isPdf
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const admin = createAdminClient();
    await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
    const stamp = (exportedAt ?? "").replace(/[:.]/g, "-") || yearMonth;
    const storagePath = `${clientId}/${yearMonth}-${stamp}.${format}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType, upsert: true });
    if (upErr) throw upErr;

    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);

    // exported_files 기록 (기존 배열에 append)
    const { data: existing } = await supabase
      .from("reports")
      .select("exported_files")
      .eq("client_id", clientId)
      .eq("year_month", yearMonth)
      .maybeSingle();
    const files = Array.isArray(existing?.exported_files)
      ? existing.exported_files
      : [];
    files.push({ format, storage_path: storagePath, exported_at: exportedAt ?? null });
    await supabase
      .from("reports")
      .upsert(
        { client_id: clientId, year_month: yearMonth, exported_files: files },
        { onConflict: "client_id,year_month" },
      );

    return NextResponse.json({ ok: true, url: signed?.signedUrl ?? null, format });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "내보내기 실패",
    });
  }
}
