"use server";

import { createClient } from "@/lib/supabase/server";
import type { NaverManualMetrics, SectionReports } from "@/types/database";

export interface ReportPatch {
  gsc_snapshot?: Record<string, unknown> | null;
  ga4_snapshot?: Record<string, unknown> | null;
  naver_manual_metrics?: NaverManualMetrics | null;
  content_summary?: Record<string, unknown> | null;
  next_month_plans?: Record<string, unknown> | null;
  ai_summary?: string | null;
  section_reports?: SectionReports | null;
  status?: "draft" | "final";
}

/** 리포트 upsert (client_id + year_month 유니크). 저장된 행 반환. */
export async function saveReport(
  clientId: string,
  yearMonth: string,
  patch: ReportPatch,
): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .upsert(
      { client_id: clientId, year_month: yearMonth, ...patch },
      { onConflict: "client_id,year_month" },
    );
  if (!error) return { ok: true };

  // 0008 마이그레이션 미실행 환경: section_reports 없이 재시도하고 안내 [graceful]
  if (
    error.message.includes("section_reports") &&
    patch.section_reports !== undefined
  ) {
    const { section_reports: _omit, ...rest } = patch;
    void _omit;
    const { error: retryErr } = await supabase
      .from("reports")
      .upsert(
        { client_id: clientId, year_month: yearMonth, ...rest },
        { onConflict: "client_id,year_month" },
      );
    if (!retryErr) {
      return {
        ok: true,
        warning:
          "구글/네이버 섹션 리포트는 저장되지 않았습니다 — supabase/migrations/0008을 SQL Editor에서 실행하세요.",
      };
    }
    return { ok: false, error: retryErr.message };
  }
  return { ok: false, error: error.message };
}
