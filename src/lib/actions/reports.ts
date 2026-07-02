"use server";

import { createClient } from "@/lib/supabase/server";
import type { NaverManualMetrics } from "@/types/database";

export interface ReportPatch {
  gsc_snapshot?: Record<string, unknown> | null;
  ga4_snapshot?: Record<string, unknown> | null;
  naver_manual_metrics?: NaverManualMetrics | null;
  content_summary?: Record<string, unknown> | null;
  next_month_plans?: Record<string, unknown> | null;
  ai_summary?: string | null;
  status?: "draft" | "final";
}

/** 리포트 upsert (client_id + year_month 유니크). 저장된 행 반환. */
export async function saveReport(
  clientId: string,
  yearMonth: string,
  patch: ReportPatch,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .upsert(
      { client_id: clientId, year_month: yearMonth, ...patch },
      { onConflict: "client_id,year_month" },
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}
