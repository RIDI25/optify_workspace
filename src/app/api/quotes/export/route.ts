import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { QUOTE_NO_PREFIX, QUOTE_SUPPLIER } from "@/lib/quote-config";
import {
  calcQuoteTotals,
  type QuoteDocModel,
  type QuoteLineItem,
  type VatMode,
} from "@/lib/export/quote-model";
import { renderQuotePdf } from "@/lib/export/quote-pdf";
import { buildQuoteDocx } from "@/lib/export/quote-docx";

export const runtime = "nodejs";
export const maxDuration = 120;

const BUCKET = "quotes";

interface QuotePayload {
  customer_name: string;
  customer_contact: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  quote_date: string; // 'YYYY-MM-DD'
  valid_until: string | null;
  items: QuoteLineItem[];
  vat_mode: VatMode;
  notes: string | null;
}

/** 오늘(KST) 기준 'OPT-YYYYMMDD-NN' 다음 번호 채번 */
async function nextQuoteNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteDate: string,
): Promise<string> {
  const ymd = quoteDate.replaceAll("-", "");
  const prefix = `${QUOTE_NO_PREFIX}-${ymd}-`;
  const { data } = await supabase
    .from("quotes")
    .select("quote_no")
    .like("quote_no", `${prefix}%`)
    .order("quote_no", { ascending: false })
    .limit(1);
  const last = data?.[0]?.quote_no as string | undefined;
  const n = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(2, "0")}`;
}

/**
 * 견적서 저장 + PDF/docx 생성 → 비공개 Storage 저장 + 서명 URL 반환. owner 전용.
 * body: { quoteId?, quote?, format('pdf'|'docx'), exportedAt }
 *  - quote만: 신규 저장(견적번호 채번) 후 출력
 *  - quoteId + quote: 기존 견적 갱신 후 출력 (같은 견적 PDF→docx 연속 출력용)
 *  - quoteId만: 저장된 데이터 그대로 재출력 (내역 리스트 재다운로드)
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  // RLS로도 차단되지만 라우트에서도 owner 명시 확인
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "owner") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const body = await req.json();
  const { quoteId, quote, format, exportedAt } = body as {
    quoteId?: string;
    quote?: QuotePayload;
    format: "pdf" | "docx";
    exportedAt?: string;
  };
  if (!["pdf", "docx"].includes(format) || (!quoteId && !quote)) {
    return NextResponse.json(
      { ok: false, error: "format(pdf|docx)과 quote 또는 quoteId 필요" },
      { status: 400 },
    );
  }

  try {
    let row: Record<string, unknown> | null = null;

    if (quote) {
      if (!quote.customer_name?.trim() || !quote.items?.length) {
        return NextResponse.json(
          { ok: false, error: "고객사명과 품목 1개 이상 필요" },
          { status: 400 },
        );
      }
      const totals = calcQuoteTotals(quote.items, quote.vat_mode);
      const fields = {
        customer_name: quote.customer_name.trim(),
        customer_contact: quote.customer_contact || null,
        customer_phone: quote.customer_phone || null,
        customer_email: quote.customer_email || null,
        quote_date: quote.quote_date,
        valid_until: quote.valid_until || null,
        items: quote.items,
        vat_mode: quote.vat_mode,
        supply_amount: totals.supply,
        vat_amount: totals.vat,
        total_amount: totals.total,
        notes: quote.notes || null,
      };

      if (quoteId) {
        const { data, error } = await supabase
          .from("quotes")
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq("id", quoteId)
          .select()
          .single();
        if (error) throw error;
        row = data;
      } else {
        const quote_no = await nextQuoteNo(supabase, quote.quote_date);
        const { data, error } = await supabase
          .from("quotes")
          .insert({ ...fields, quote_no, created_by: user.id })
          .select()
          .single();
        if (error) throw error;
        row = data;
      }
    } else {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", quoteId!)
        .single();
      if (error) throw error;
      row = data;
    }

    const model: QuoteDocModel = {
      quoteNo: row!.quote_no as string,
      customerName: row!.customer_name as string,
      customerContact: (row!.customer_contact as string | null) ?? null,
      quoteDate: row!.quote_date as string,
      validUntil: (row!.valid_until as string | null) ?? null,
      supplier: QUOTE_SUPPLIER,
      items: row!.items as QuoteLineItem[],
      vatMode: row!.vat_mode as VatMode,
      totals: {
        supply: Number(row!.supply_amount),
        vat: Number(row!.vat_amount),
        total: Number(row!.total_amount),
      },
      notes: (row!.notes as string | null) ?? null,
    };

    const isPdf = format === "pdf";
    const buffer = isPdf ? await renderQuotePdf(model) : await buildQuoteDocx(model);
    const contentType = isPdf
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const admin = createAdminClient();
    await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
    const storagePath = `${row!.id}/${model.quoteNo}.${format}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType, upsert: true });
    if (upErr) throw upErr;

    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600, {
        download: `${model.quoteNo}_${model.customerName}.${format}`,
      });

    // exported_files 기록 (동일 format은 최신으로 교체)
    const files = (Array.isArray(row!.exported_files) ? row!.exported_files : []).filter(
      (f: { format?: string }) => f.format !== format,
    );
    files.push({ format, storage_path: storagePath, exported_at: exportedAt ?? null });
    await supabase.from("quotes").update({ exported_files: files }).eq("id", row!.id as string);

    return NextResponse.json({
      ok: true,
      url: signed?.signedUrl ?? null,
      format,
      quoteId: row!.id,
      quoteNo: model.quoteNo,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "견적서 생성 실패",
    });
  }
}
