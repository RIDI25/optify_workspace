"use server";

import { createClient } from "@/lib/supabase/server";
import type { TaxInvoiceStatus } from "@/types/database";

/** 상태 변경으로 자동 기록된 입금 행을 알아보는 메모 (손으로 넣은 입금과 구분) */
const AUTO_PAYMENT_MEMO = "상태를 입금완료로 바꿔 자동 기록";

async function team() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "로그인이 필요합니다." };
  const { data: me } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!me) return { supabase, error: "팀에 등록된 계정만 할 수 있습니다." };
  return { supabase, error: null };
}

/**
 * 세금계산서 상태 변경 (서버 한 곳에서 처리) [코덱스 2차 ③].
 * - 입금완료: 서버가 입금 합계를 다시 읽어 남은 금액만 자동 기록한다 (두 탭에서 동시에 눌러도 중복되지 않게 마지막에 재검사).
 * - 되돌리기: 자동 기록분만 지운다. 손으로 넣은 입금은 남긴다.
 * 실패는 그대로 돌려준다 — 화면이 '성공'으로 보이면서 DB 만 다른 일이 없게.
 */
export async function setInvoiceStatus(
  invoiceId: string,
  status: TaxInvoiceStatus,
  paidAt?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, error: authErr } = await team();
  if (authErr) return { ok: false, error: authErr };

  const { data: inv, error: invErr } = await supabase
    .from("tax_invoices")
    .select("id, total_amount, status, paid_at")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr || !inv) return { ok: false, error: invErr?.message ?? "계산서를 찾을 수 없습니다." };

  const paid_at = status === "paid" ? (paidAt || inv.paid_at || new Date().toISOString().slice(0, 10)) : null;
  const { error } = await supabase
    .from("tax_invoices")
    .update({ status, paid_at, updated_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (error) return { ok: false, error: error.message };

  if (status === "paid") {
    const { data: pays } = await supabase.from("invoice_payments").select("amount").eq("invoice_id", invoiceId);
    const already = (pays ?? []).reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Number(inv.total_amount) - already;
    if (remaining > 0) {
      // 같은 순간 다른 탭이 먼저 기록했는지 한 번 더 확인
      const { data: again } = await supabase.from("invoice_payments").select("amount").eq("invoice_id", invoiceId);
      const now = (again ?? []).reduce((s, p) => s + Number(p.amount), 0);
      const left = Number(inv.total_amount) - now;
      if (left > 0) {
        const { error: pErr } = await supabase.from("invoice_payments").insert({
          invoice_id: invoiceId,
          paid_date: paid_at,
          amount: left,
          kind: "other",
          memo: AUTO_PAYMENT_MEMO,
        });
        if (pErr) return { ok: false, error: `상태는 바꿨지만 입금 기록에 실패했습니다: ${pErr.message}` };
      }
    }
  } else if (inv.status === "paid") {
    const { error: dErr } = await supabase
      .from("invoice_payments")
      .delete()
      .eq("invoice_id", invoiceId)
      .eq("memo", AUTO_PAYMENT_MEMO);
    if (dErr) return { ok: false, error: `자동 기록 입금을 지우지 못했습니다: ${dErr.message}` };
  }
  return { ok: true };
}

/** 입금일 수정 — 계산서 날짜와 자동 기록 입금 행의 날짜를 함께 바꾼다 */
export async function setInvoicePaidAt(
  invoiceId: string,
  paidAt: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, error: authErr } = await team();
  if (authErr) return { ok: false, error: authErr };
  const { error } = await supabase
    .from("tax_invoices")
    .update({ paid_at: paidAt || null, updated_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (error) return { ok: false, error: error.message };
  if (paidAt) {
    const { error: pErr } = await supabase
      .from("invoice_payments")
      .update({ paid_date: paidAt })
      .eq("invoice_id", invoiceId)
      .eq("memo", AUTO_PAYMENT_MEMO);
    if (pErr) return { ok: false, error: `입금 행 날짜를 바꾸지 못했습니다: ${pErr.message}` };
  }
  return { ok: true };
}
