/**
 * 워크스페이스 비서 챗봇 — 도구 정의·실행기.
 * 실행은 사용자 세션의 Supabase 클라이언트로 → RLS 권한이 그대로 적용된다
 * (예: 세금계산서·리드는 owner 전용 — member가 시도하면 권한 오류를 그대로 안내).
 * 도구 추가는 TOOLS 배열 + executeAssistantTool의 case 하나로 끝.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "add_tax_invoice",
    description:
      "세금계산서 발행 이력을 매출 관리에 등록한다. 사용자가 '세금계산서 발행했어, 등록해줘'라고 하면 사용. 금액이 공급가인지 합계(VAT 포함)인지 명시가 없으면 공급가액으로 간주하고 부가세 10%를 자동 계산한다.",
    input_schema: {
      type: "object",
      properties: {
        issue_date: { type: "string", description: "발행일 YYYY-MM-DD (기본: 오늘)" },
        counterparty: { type: "string", description: "거래처명 (세금계산서 상 상대방, 필수)" },
        end_client_name: { type: "string", description: "실고객명(건명) — 파트너 경유 시 실제 고객 구분" },
        description: { type: "string", description: "적요/품목 (예: 홈페이지 제작 및 SEO 용역)" },
        supply_amount: { type: "integer", description: "공급가액 (원, 필수)" },
        vat_amount: { type: "integer", description: "부가세 (원). 생략 시 공급가액의 10%" },
        deal_channel: { type: "string", enum: ["direct", "referral", "partner"], description: "거래 구분 (기본 direct)" },
        memo: { type: "string", description: "메모" },
      },
      required: ["counterparty", "supply_amount"],
    },
  },
  {
    name: "list_tax_invoices",
    description:
      "등록된 세금계산서 목록을 조회한다 (입금 등록 전 대상 인보이스를 찾을 때, 또는 미수금 확인 요청 시 사용). 각 건의 id·합계·입금액·미수금을 반환한다.",
    input_schema: {
      type: "object",
      properties: {
        counterparty: { type: "string", description: "거래처명 부분 일치 검색 (생략 시 최근 순)" },
        only_unpaid: { type: "boolean", description: "true면 미수금 있는 건만" },
        limit: { type: "integer", description: "최대 건수 (기본 10)" },
      },
    },
  },
  {
    name: "add_invoice_payment",
    description:
      "인보이스에 입금을 등록한다 (선금/잔금 분할 입금). 먼저 list_tax_invoices로 대상 인보이스 id를 찾은 뒤 호출한다. 입금 합계가 인보이스 합계에 도달하면 자동으로 입금완료 처리된다.",
    input_schema: {
      type: "object",
      properties: {
        invoice_id: { type: "string", description: "대상 인보이스 id (list_tax_invoices에서 획득, 필수)" },
        amount: { type: "integer", description: "입금액 (원, 필수)" },
        paid_date: { type: "string", description: "입금일 YYYY-MM-DD (기본: 오늘)" },
        kind: { type: "string", enum: ["deposit", "balance", "full", "other"], description: "구분: 선금/잔금/전액/기타 (기본 deposit)" },
        memo: { type: "string", description: "메모" },
      },
      required: ["invoice_id", "amount"],
    },
  },
  {
    name: "add_lead",
    description: "영업 리드를 등록한다 (문의 온 잠재 고객). '어디서 문의 왔어, 리드 등록해줘' 류 요청에 사용.",
    input_schema: {
      type: "object",
      properties: {
        company_name: { type: "string", description: "업체명 (필수)" },
        contact_name: { type: "string", description: "담당자명" },
        phone: { type: "string", description: "연락처" },
        email: { type: "string", description: "이메일" },
        industry: { type: "string", description: "업종 (병의원/법률/학원 등)" },
        region: { type: "string", description: "지역" },
        source: { type: "string", description: "유입경로 (블로그/유튜브/소개 등)" },
        deal_channel: { type: "string", enum: ["direct", "referral", "partner"], description: "거래 구분 (기본 direct)" },
        partner_name: { type: "string", description: "파트너명 또는 소개자 (구분이 direct가 아닐 때)" },
        next_followup: { type: "string", description: "다음 팔로업일 YYYY-MM-DD" },
        memo: { type: "string", description: "메모" },
      },
      required: ["company_name"],
    },
  },
];

function kstToday(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

const wonFmt = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/** 도구 실행 — 결과는 모델이 읽는 한국어 요약 문자열(JSON) */
export async function executeAssistantTool(
  supabase: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; result: string }> {
  try {
    switch (name) {
      case "add_tax_invoice": {
        const supply = Number(input.supply_amount) || 0;
        if (!input.counterparty || supply <= 0) {
          return { ok: false, result: "거래처명과 공급가액이 필요합니다." };
        }
        const vat = input.vat_amount != null ? Number(input.vat_amount) : Math.round(supply * 0.1);
        const row = {
          issue_date: (input.issue_date as string) || kstToday(),
          counterparty: String(input.counterparty).trim(),
          end_client_name: (input.end_client_name as string) || null,
          description: (input.description as string) || null,
          supply_amount: supply,
          vat_amount: vat,
          total_amount: supply + vat,
          deal_channel: (input.deal_channel as string) || "direct",
          memo: (input.memo as string) || null,
        };
        const { error } = await supabase.from("tax_invoices").insert(row);
        if (error) return { ok: false, result: `등록 실패: ${error.message}` };
        return {
          ok: true,
          result: `세금계산서 등록 완료 — ${row.issue_date} ${row.counterparty}${row.end_client_name ? `(건명: ${row.end_client_name})` : ""}, 공급가 ${wonFmt(supply)} + 부가세 ${wonFmt(vat)} = 합계 ${wonFmt(supply + vat)}. 매출 메뉴에서 확인 가능.`,
        };
      }
      case "list_tax_invoices": {
        let q = supabase
          .from("tax_invoices")
          .select("id, issue_date, counterparty, end_client_name, total_amount, status")
          .neq("status", "cancelled")
          .order("issue_date", { ascending: false })
          .limit(Math.min(Number(input.limit) || 10, 30));
        if (input.counterparty) q = q.ilike("counterparty", `%${String(input.counterparty).trim()}%`);
        const { data, error } = await q;
        if (error) return { ok: false, result: `조회 실패: ${error.message}` };
        const invoices = data ?? [];
        if (!invoices.length) return { ok: true, result: "해당하는 세금계산서가 없습니다." };
        const ids = invoices.map((i) => i.id);
        const { data: pays } = await supabase
          .from("invoice_payments")
          .select("invoice_id, amount")
          .in("invoice_id", ids);
        const paid = new Map<string, number>();
        for (const p of pays ?? []) {
          paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount));
        }
        const rows = invoices
          .map((i) => {
            const p = paid.get(i.id) ?? 0;
            const remain = Math.max(0, Number(i.total_amount) - p);
            return { ...i, paid: p, remaining: remain };
          })
          .filter((i) => (input.only_unpaid ? i.remaining > 0 : true));
        return {
          ok: true,
          result: rows
            .map(
              (i) =>
                `id=${i.id} | ${i.issue_date} | ${i.counterparty}${i.end_client_name ? `(${i.end_client_name})` : ""} | 합계 ${wonFmt(Number(i.total_amount))} | 입금 ${wonFmt(i.paid)} | 미수 ${wonFmt(i.remaining)}`,
            )
            .join("\n") || "미수 건이 없습니다.",
        };
      }
      case "add_invoice_payment": {
        const amount = Number(input.amount) || 0;
        const invoiceId = String(input.invoice_id || "");
        if (!invoiceId || amount <= 0) return { ok: false, result: "invoice_id와 입금액이 필요합니다." };
        const { data: inv, error: invErr } = await supabase
          .from("tax_invoices")
          .select("id, counterparty, total_amount, status")
          .eq("id", invoiceId)
          .single();
        if (invErr || !inv) return { ok: false, result: "해당 인보이스를 찾을 수 없습니다." };
        const paidDate = (input.paid_date as string) || kstToday();
        const { error } = await supabase.from("invoice_payments").insert({
          invoice_id: invoiceId,
          paid_date: paidDate,
          amount,
          kind: (input.kind as string) || "deposit",
          memo: (input.memo as string) || null,
        });
        if (error) return { ok: false, result: `입금 등록 실패: ${error.message}` };
        const { data: pays } = await supabase
          .from("invoice_payments")
          .select("amount")
          .eq("invoice_id", invoiceId);
        const totalPaid = (pays ?? []).reduce((s, p) => s + Number(p.amount), 0);
        const remaining = Math.max(0, Number(inv.total_amount) - totalPaid);
        if (remaining === 0 && inv.status !== "paid") {
          await supabase
            .from("tax_invoices")
            .update({ status: "paid", paid_at: paidDate, updated_at: new Date().toISOString() })
            .eq("id", invoiceId);
        }
        return {
          ok: true,
          result: `입금 등록 완료 — ${inv.counterparty}에 ${wonFmt(amount)} (${paidDate}). 누적 입금 ${wonFmt(totalPaid)}, 남은 미수 ${wonFmt(remaining)}${remaining === 0 ? " → 완납 처리됨" : ""}.`,
        };
      }
      case "add_lead": {
        if (!input.company_name) return { ok: false, result: "업체명이 필요합니다." };
        const row = {
          company_name: String(input.company_name).trim(),
          contact_name: (input.contact_name as string) || null,
          phone: (input.phone as string) || null,
          email: (input.email as string) || null,
          industry: (input.industry as string) || null,
          region: (input.region as string) || null,
          source: (input.source as string) || null,
          deal_channel: (input.deal_channel as string) || "direct",
          partner_name: (input.partner_name as string) || null,
          next_followup: (input.next_followup as string) || null,
          memo: (input.memo as string) || null,
        };
        const { error } = await supabase.from("leads").insert(row);
        if (error) return { ok: false, result: `리드 등록 실패: ${error.message}` };
        return {
          ok: true,
          result: `리드 등록 완료 — ${row.company_name}${row.industry ? ` (${row.industry})` : ""}${row.next_followup ? `, 팔로업 ${row.next_followup}` : ""}. 영업·리드 메뉴에서 확인 가능.`,
        };
      }
      default:
        return { ok: false, result: `알 수 없는 도구: ${name}` };
    }
  } catch (e) {
    return { ok: false, result: e instanceof Error ? e.message : "도구 실행 오류" };
  }
}
