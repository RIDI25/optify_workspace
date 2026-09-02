"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ENTRY_TYPES,
  PAYMENT_METHODS,
  categoriesFor,
  entryTypeLabel,
  ledgerCategoryLabel,
  paymentMethodLabel,
} from "@/lib/ledger";
import { won } from "@/lib/export/quote-model";
import type { LedgerEntry } from "@/types/database";

const input =
  "rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent-deep";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function thisMonth(): string {
  return today().slice(0, 7);
}

function shiftMonth(ym: string, dir: -1 | 1): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + dir, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 화면·CSV 공용 행 — 수기 기입 + 세금계산서 입금(자동) 병합 */
interface Row {
  key: string;
  date: string;
  entry_type: string;
  payment_method: string;
  amount: number;
  counterparty: string;
  description: string;
  category: string;
  memo: string;
  /** manual = 수기 기입(수정·삭제 가능) / invoice = 매출 메뉴의 입금 기록(자동) */
  source: "manual" | "invoice";
  entry?: LedgerEntry;
}

interface Draft {
  entry_date: string;
  entry_type: string;
  payment_method: string;
  amount: string;
  counterparty: string;
  description: string;
  category: string;
  memo: string;
}

function csvField(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * 회계 장부 — 입금·지출·카드 사용 내역 기입 + 세무사무소 전달용 CSV.
 * 세금계산서 입금은 매출 메뉴 기록을 자동 병합 (이중 기입 방지).
 */
export function LedgerView({ meId }: { meId: string }) {
  const supabase = createClient();
  const [month, setMonth] = useState(thisMonth());
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [invoiceRows, setInvoiceRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyDraft: Draft = {
    entry_date: today(),
    entry_type: "expense",
    payment_method: "card",
    amount: "",
    counterparty: "",
    description: "",
    category: "etc",
    memo: "",
  };
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const monthEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const load = useCallback(async () => {
    setLoading(true);
    const [entRes, payRes] = await Promise.all([
      supabase
        .from("ledger_entries")
        .select("*")
        .gte("entry_date", monthStart)
        .lte("entry_date", monthEnd)
        .order("entry_date"),
      supabase
        .from("invoice_payments")
        .select("id, invoice_id, paid_date, amount, memo")
        .gte("paid_date", monthStart)
        .lte("paid_date", monthEnd),
    ]);
    setEntries((entRes.data ?? []) as LedgerEntry[]);

    // 세금계산서 입금 → 거래처명 붙여서 자동 입금 행으로
    const pays = (payRes.data ?? []) as {
      id: string;
      invoice_id: string;
      paid_date: string;
      amount: number;
      memo: string | null;
    }[];
    const invIds = [...new Set(pays.map((p) => p.invoice_id))];
    let counterpartyOf = new Map<string, string>();
    if (invIds.length) {
      const { data: invs } = await supabase
        .from("tax_invoices")
        .select("id, counterparty")
        .in("id", invIds);
      counterpartyOf = new Map(
        ((invs ?? []) as { id: string; counterparty: string }[]).map((i) => [
          i.id,
          i.counterparty,
        ]),
      );
    }
    setInvoiceRows(
      pays.map((p) => ({
        key: `inv-${p.id}`,
        date: p.paid_date,
        entry_type: "income",
        payment_method: "transfer",
        amount: Number(p.amount),
        counterparty: counterpartyOf.get(p.invoice_id) ?? "-",
        description: "세금계산서 입금",
        category: "sales_income",
        memo: p.memo ?? "",
        source: "invoice" as const,
      })),
    );
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const rows: Row[] = [
    ...entries.map((e) => ({
      key: e.id,
      date: e.entry_date,
      entry_type: e.entry_type,
      payment_method: e.payment_method,
      amount: Number(e.amount),
      counterparty: e.counterparty ?? "",
      description: e.description ?? "",
      category: e.category,
      memo: e.memo ?? "",
      source: "manual" as const,
      entry: e,
    })),
    ...invoiceRows,
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const incomeSum = rows
    .filter((r) => r.entry_type === "income")
    .reduce((s, r) => s + r.amount, 0);
  const expenseSum = rows
    .filter((r) => r.entry_type === "expense")
    .reduce((s, r) => s + r.amount, 0);
  const cardSum = rows
    .filter((r) => r.entry_type === "expense" && r.payment_method === "card")
    .reduce((s, r) => s + r.amount, 0);

  function setType(entry_type: string) {
    const cats = categoriesFor(entry_type);
    setDraft((d) => ({
      ...d,
      entry_type,
      category: cats.some((c) => c.key === d.category)
        ? d.category
        : (entry_type === "income" ? "other_income" : "etc"),
      payment_method: entry_type === "income" ? "transfer" : d.payment_method,
    }));
  }

  async function save() {
    const amount = Math.round(Number(draft.amount));
    if (!amount || amount <= 0) {
      setMsg("금액을 입력하세요.");
      return;
    }
    setBusy(true);
    setMsg("");
    const row = {
      entry_date: draft.entry_date || today(),
      entry_type: draft.entry_type,
      payment_method: draft.payment_method,
      amount,
      counterparty: draft.counterparty.trim() || null,
      description: draft.description.trim() || null,
      category: draft.category,
      memo: draft.memo.trim() || null,
    };
    const { error } = editingId
      ? await supabase
          .from("ledger_entries")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", editingId)
      : await supabase.from("ledger_entries").insert({ ...row, created_by: meId });
    setBusy(false);
    if (error) {
      setMsg(`저장 실패: ${error.message}`);
      return;
    }
    setDraft({ ...emptyDraft, entry_date: draft.entry_date, entry_type: draft.entry_type });
    setEditingId(null);
    await load();
  }

  function startEdit(e: LedgerEntry) {
    setEditingId(e.id);
    setDraft({
      entry_date: e.entry_date,
      entry_type: e.entry_type,
      payment_method: e.payment_method,
      amount: String(e.amount),
      counterparty: e.counterparty ?? "",
      description: e.description ?? "",
      category: e.category,
      memo: e.memo ?? "",
    });
  }

  async function remove(e: LedgerEntry) {
    if (!confirm(`${e.entry_date} ${won(Number(e.amount))} 기록을 삭제할까요?`)) return;
    const { data, error } = await supabase
      .from("ledger_entries")
      .delete()
      .eq("id", e.id)
      .select("id");
    if (error || !data?.length) {
      setMsg(`삭제 실패: ${error?.message ?? "본인이 기입한 건 또는 owner만 삭제할 수 있습니다."}`);
      return;
    }
    setEntries((es) => es.filter((x) => x.id !== e.id));
  }

  /** 세무사무소 전달용 — 엑셀에서 바로 열리는 CSV (UTF-8 BOM) */
  function exportCsv() {
    const header = ["일자", "구분", "결제수단", "거래처/사용처", "적요", "분류", "금액(원)", "메모", "출처"];
    const lines = rows.map((r) =>
      [
        r.date,
        entryTypeLabel(r.entry_type),
        paymentMethodLabel(r.payment_method),
        r.counterparty,
        r.description,
        ledgerCategoryLabel(r.category),
        String(r.amount),
        r.memo,
        r.source === "invoice" ? "세금계산서 입금(자동)" : "수기",
      ]
        .map(csvField)
        .join(","),
    );
    const summary = [
      "",
      `합계,입금,${incomeSum}`,
      `합계,지출,${expenseSum}`,
      `합계,차액,${incomeSum - expenseSum}`,
    ];
    // ﻿(BOM) — 엑셀이 UTF-8 한글을 바로 인식하게 한다
    const csv = "﻿" + [header.join(","), ...lines, ...summary].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `옵티파이_장부_${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">장부</h1>
          <p className="mt-1 text-sm text-muted">
            입금·지출·카드 사용 내역을 적습니다. 세금계산서 입금은 매출 메뉴
            기록이 자동으로 표시됩니다.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="rounded-md border border-border px-2 py-1 text-sm text-muted hover:text-ink"
          >
            ◀
          </button>
          <span className="px-2 font-mono text-sm font-semibold text-ink">{month}</span>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="rounded-md border border-border px-2 py-1 text-sm text-muted hover:text-ink"
          >
            ▶
          </button>
          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="ml-2 rounded-md bg-accent-deep px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            title="이 달 내역을 엑셀용 CSV로 저장 — 세무사무소 전달용"
          >
            세무자료 내보내기
          </button>
        </div>
      </div>

      {/* 월 요약 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted">입금 합계</p>
          <p className="mt-1 font-mono text-lg font-bold text-accent-deep">{won(incomeSum)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted">지출 합계</p>
          <p className="mt-1 font-mono text-lg font-bold text-red-600">{won(expenseSum)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted">이 중 카드 지출</p>
          <p className="mt-1 font-mono text-lg font-bold text-ink">{won(cardSum)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted">차액 (입금−지출)</p>
          <p
            className={`mt-1 font-mono text-lg font-bold ${incomeSum - expenseSum >= 0 ? "text-accent-deep" : "text-red-600"}`}
          >
            {won(incomeSum - expenseSum)}
          </p>
        </div>
      </div>

      {/* 빠른 기입 */}
      <section className="rounded-lg border border-accent-deep/30 bg-tint/30 p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          {editingId ? "기록 수정" : "빠른 기입"}
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
          <input
            type="date"
            value={draft.entry_date}
            onChange={(e) => setDraft({ ...draft, entry_date: e.target.value })}
            className={input}
          />
          <select value={draft.entry_type} onChange={(e) => setType(e.target.value)} className={input}>
            {ENTRY_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            value={draft.payment_method}
            onChange={(e) => setDraft({ ...draft, payment_method: e.target.value })}
            className={input}
          >
            {PAYMENT_METHODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            placeholder="금액 (원)"
            className={`text-right ${input}`}
          />
          <input
            value={draft.counterparty}
            onChange={(e) => setDraft({ ...draft, counterparty: e.target.value })}
            placeholder="거래처/사용처"
            className={input}
          />
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="적요 (무슨 돈?)"
            className={input}
          />
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            className={input}
          >
            {categoriesFor(draft.entry_type).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <button
              onClick={save}
              disabled={busy}
              className="flex-1 rounded-md bg-accent px-3 py-1.5 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "저장…" : editingId ? "수정" : "기입"}
            </button>
            {editingId && (
              <button
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyDraft);
                }}
                className="rounded-md border border-border px-2 py-1.5 text-sm text-muted"
              >
                취소
              </button>
            )}
          </div>
        </div>
        {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
      </section>

      {/* 내역 */}
      <section className="overflow-x-auto rounded-lg border border-border bg-surface">
        {loading ? (
          <p className="p-6 text-center text-sm text-muted">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            {month}에 기록이 없습니다. 위에서 첫 내역을 기입해보세요.
          </p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">일자</th>
                <th className="px-3 py-2 font-medium">구분</th>
                <th className="px-3 py-2 font-medium">결제</th>
                <th className="px-3 py-2 font-medium">거래처/사용처</th>
                <th className="px-3 py-2 font-medium">적요</th>
                <th className="px-3 py-2 font-medium">분류</th>
                <th className="px-3 py-2 text-right font-medium">금액</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-muted">{r.date}</td>
                  <td className="px-3 py-2">
                    <span
                      className={[
                        "rounded px-1.5 py-0.5 text-[11px] font-medium",
                        r.entry_type === "income"
                          ? "bg-tint text-accent-deep"
                          : "bg-red-50 text-red-600",
                      ].join(" ")}
                    >
                      {entryTypeLabel(r.entry_type)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {paymentMethodLabel(r.payment_method)}
                  </td>
                  <td className="px-3 py-2 text-ink">
                    {r.counterparty || "-"}
                    {r.source === "invoice" && (
                      <span className="ml-1.5 rounded bg-subtle px-1 py-0.5 text-[10px] text-muted" title="매출 메뉴의 입금 기록 — 수정은 매출에서">
                        자동
                      </span>
                    )}
                  </td>
                  <td className="max-w-48 truncate px-3 py-2 text-xs text-muted" title={r.memo || undefined}>
                    {r.description || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {ledgerCategoryLabel(r.category)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${r.entry_type === "income" ? "text-accent-deep" : "text-ink"}`}
                  >
                    {r.entry_type === "income" ? "+" : "−"}
                    {Number(r.amount).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                    {r.source === "manual" && r.entry && (
                      <>
                        <button
                          onClick={() => startEdit(r.entry!)}
                          className="text-muted hover:text-accent-deep"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => remove(r.entry!)}
                          className="ml-2 text-muted hover:text-red-600"
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-muted">
        세무자료 내보내기는 이 달 전체 내역(자동 입금 포함)을 엑셀에서 바로
        열리는 CSV 파일로 저장합니다. 세무사무소에 그대로 전달하면 됩니다.
      </p>
    </div>
  );
}
