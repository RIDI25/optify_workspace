"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEPOSIT_RATE } from "@/lib/quote-config";
import { won } from "@/lib/export/quote-model";
import type { InvoicePayment, PaymentKind, TaxInvoice } from "@/types/database";

const input =
  "rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent-deep";

const KIND_LABELS: Record<PaymentKind, string> = {
  deposit: "선금",
  balance: "잔금",
  full: "전액",
  other: "기타",
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 입금·미수금 관리 — 인보이스별 부분 입금(선금/잔금) 기록.
 * 입금 합계가 인보이스 합계에 도달하면 상태를 자동으로 '입금완료'로 갱신.
 */
export function PaymentsSection({
  invoices,
  payments,
  onChanged,
}: {
  invoices: TaxInvoice[];
  payments: InvoicePayment[];
  onChanged: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<
    Record<string, { kind: PaymentKind; amount: string; date: string; memo: string }>
  >({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const paidByInvoice = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + Number(p.amount));
    }
    return map;
  }, [payments]);

  const active = invoices.filter((inv) => inv.status !== "cancelled");
  const rows = active
    .map((inv) => {
      const paid = paidByInvoice.get(inv.id) ?? 0;
      return { inv, paid, remaining: Math.max(0, Number(inv.total_amount) - paid) };
    })
    .filter((r) => showAll || r.remaining > 0);

  const totalRemaining = active.reduce(
    (s, inv) => s + Math.max(0, Number(inv.total_amount) - (paidByInvoice.get(inv.id) ?? 0)),
    0,
  );

  function draftFor(inv: TaxInvoice, remaining: number) {
    return (
      drafts[inv.id] ?? {
        kind: "deposit" as PaymentKind,
        amount: String(Math.min(remaining, Math.round(Number(inv.total_amount) * DEPOSIT_RATE))),
        date: today(),
        memo: "",
      }
    );
  }

  function setDraft(id: string, patch: Partial<{ kind: PaymentKind; amount: string; date: string; memo: string }>, inv?: TaxInvoice, remaining?: number) {
    setDrafts((prev) => {
      const base = prev[id] ?? (inv ? draftFor(inv, remaining ?? 0) : { kind: "deposit" as PaymentKind, amount: "", date: today(), memo: "" });
      const next = { ...base, ...patch };
      // 구분 변경 시 금액 프리필 (수동 수정 가능)
      if (patch.kind && inv) {
        const total = Number(inv.total_amount);
        if (patch.kind === "deposit") next.amount = String(Math.min(remaining ?? total, Math.round(total * DEPOSIT_RATE)));
        else if (patch.kind === "balance" || patch.kind === "full") next.amount = String(remaining ?? total);
        else next.amount = "";
      }
      return { ...prev, [id]: next };
    });
  }

  async function addPayment(inv: TaxInvoice, remaining: number) {
    const d = draftFor(inv, remaining);
    const amount = Number(d.amount);
    if (!amount || amount <= 0) {
      setMsg("입금액을 입력하세요.");
      return;
    }
    setBusy(inv.id);
    setMsg("");
    const supabase = createClient();
    const { error } = await supabase.from("invoice_payments").insert({
      invoice_id: inv.id,
      paid_date: d.date,
      amount,
      kind: d.kind,
      memo: d.memo || null,
    });
    if (error) {
      setBusy("");
      setMsg(`저장 실패: ${error.message}`);
      return;
    }
    // 완납 시 인보이스 상태 자동 갱신
    const newPaid = (paidByInvoice.get(inv.id) ?? 0) + amount;
    if (newPaid >= Number(inv.total_amount) && inv.status !== "paid") {
      await supabase
        .from("tax_invoices")
        .update({ status: "paid", paid_at: d.date, updated_at: new Date().toISOString() })
        .eq("id", inv.id);
    }
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[inv.id];
      return next;
    });
    setBusy("");
    onChanged();
  }

  async function removePayment(p: InvoicePayment, inv: TaxInvoice) {
    if (!window.confirm(`${p.paid_date} ${KIND_LABELS[p.kind]} ${won(Number(p.amount))} 입금 기록을 삭제할까요?`)) return;
    const supabase = createClient();
    await supabase.from("invoice_payments").delete().eq("id", p.id);
    // 완납 상태였다면 미완납으로 되돌림
    const newPaid = (paidByInvoice.get(inv.id) ?? 0) - Number(p.amount);
    if (newPaid < Number(inv.total_amount) && inv.status === "paid") {
      await supabase
        .from("tax_invoices")
        .update({ status: "issued", paid_at: null, updated_at: new Date().toISOString() })
        .eq("id", inv.id);
    }
    onChanged();
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink">
          입금·미수금 관리
          {totalRemaining > 0 && (
            <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              미수 {won(totalRemaining)}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-red-500">{msg}</span>}
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="accent-[#057A4E]"
            />
            완납 건도 표시
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted">
          {showAll ? "인보이스가 없습니다." : "미수금이 없습니다. 🎉"}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map(({ inv, paid, remaining }) => {
            const d = draftFor(inv, remaining);
            const invPayments = payments.filter((p) => p.invoice_id === inv.id);
            const isOpen = expanded.has(inv.id);
            return (
              <div key={inv.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(inv.id)) next.delete(inv.id);
                        else next.add(inv.id);
                        return next;
                      })
                    }
                    className="text-left"
                  >
                    <p className="text-sm font-medium text-ink">
                      {isOpen ? "▾" : "▸"} {inv.counterparty}
                      {inv.end_client_name && (
                        <span className="ml-1 text-xs text-muted">· {inv.end_client_name}</span>
                      )}
                      <span className="ml-2 font-mono text-xs text-muted">{inv.issue_date}</span>
                    </p>
                  </button>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-muted">합계 {won(Number(inv.total_amount))}</span>
                    <span className="font-mono text-accent-deep">입금 {won(paid)}</span>
                    <span
                      className={`font-mono font-bold ${remaining > 0 ? "text-amber-700" : "text-accent-deep"}`}
                    >
                      {remaining > 0 ? `미수 ${won(remaining)}` : "완납"}
                    </span>
                  </div>
                </div>

                {remaining > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={d.kind}
                      onChange={(e) =>
                        setDraft(inv.id, { kind: e.target.value as PaymentKind }, inv, remaining)
                      }
                      className={input}
                    >
                      {Object.entries(KIND_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={d.amount}
                      onChange={(e) => setDraft(inv.id, { amount: e.target.value }, inv, remaining)}
                      placeholder="입금액 (원)"
                      className={`w-32 text-right ${input}`}
                    />
                    <input
                      type="date"
                      value={d.date}
                      onChange={(e) => setDraft(inv.id, { date: e.target.value }, inv, remaining)}
                      className={input}
                    />
                    <input
                      value={d.memo}
                      onChange={(e) => setDraft(inv.id, { memo: e.target.value }, inv, remaining)}
                      placeholder="메모 (선택)"
                      className={`w-32 ${input}`}
                    />
                    <button
                      onClick={() => addPayment(inv, remaining)}
                      disabled={busy === inv.id}
                      className="rounded-md bg-accent px-3 py-1 text-xs font-bold text-ink hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === inv.id ? "저장 중…" : "+ 입금 등록"}
                    </button>
                  </div>
                )}

                {isOpen && invPayments.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-border pt-2">
                    {invPayments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted">
                          {p.paid_date} ·{" "}
                          <span className="rounded bg-tint px-1.5 py-0.5 text-accent-deep">
                            {KIND_LABELS[p.kind]}
                          </span>{" "}
                          <span className="font-mono text-ink">{won(Number(p.amount))}</span>
                          {p.memo && <span className="ml-1">· {p.memo}</span>}
                        </span>
                        <button
                          onClick={() => removePayment(p, inv)}
                          className="text-muted hover:text-red-500"
                        >
                          삭제
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
