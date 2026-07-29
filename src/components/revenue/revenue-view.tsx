"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { DEAL_CHANNELS } from "@/lib/deal-channels";
import { won } from "@/lib/export/quote-model";
import type { DealChannel, Quote, TaxInvoice, TaxInvoiceStatus } from "@/types/database";

const input =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent-deep";

const STATUS_LABELS: Record<TaxInvoiceStatus, string> = {
  issued: "발행",
  paid: "입금완료",
  cancelled: "취소",
};

/** 적층 차트 시리즈 색 (거래처 상위 4 + 기타) */
const STACK_COLORS = ["#057A4E", "#2a78d6", "#b9770e", "#8e44ad", "#9aa5a0"];

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(offset = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const EMPTY_FORM = {
  issue_date: "",
  counterparty: "",
  end_client_name: "",
  description: "",
  supply_amount: "",
  vat_amount: "",
  deal_channel: "direct" as DealChannel,
  memo: "",
  quote_id: "",
};

export function RevenueView() {
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [wonQuotes, setWonQuotes] = useState<Quote[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM, issue_date: localDate() });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [invRes, qRes] = await Promise.all([
      supabase.from("tax_invoices").select("*").order("issue_date", { ascending: false }),
      supabase
        .from("quotes")
        .select("*")
        .eq("status", "won")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    setInvoices((invRes.data ?? []) as TaxInvoice[]);
    setWonQuotes((qRes.data ?? []) as Quote[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const set = (key: keyof typeof EMPTY_FORM) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  /** 공급가액 입력 시 부가세 10% 자동 계산 (수정 가능) */
  function onSupplyChange(e: React.ChangeEvent<HTMLInputElement>) {
    const supply = Number(e.target.value) || 0;
    setForm((f) => ({
      ...f,
      supply_amount: e.target.value,
      vat_amount: String(Math.round(supply * 0.1)),
    }));
  }

  /** 수주 견적 선택 → 거래처·건명·금액 프리필 */
  function prefillFromQuote(quoteId: string) {
    setForm((f) => ({ ...f, quote_id: quoteId }));
    const q = wonQuotes.find((x) => x.id === quoteId);
    if (!q) return;
    const firstItem = q.items[0]?.name ?? "용역";
    setForm((f) => ({
      ...f,
      quote_id: quoteId,
      counterparty: q.customer_name,
      end_client_name: q.end_client_name ?? "",
      deal_channel: q.deal_channel ?? "direct",
      description: q.items.length > 1 ? `${firstItem} 외 ${q.items.length - 1}건` : firstItem,
      supply_amount: String(q.supply_amount),
      vat_amount: String(q.vat_amount),
    }));
  }

  const supply = Number(form.supply_amount) || 0;
  const vat = Number(form.vat_amount) || 0;
  const total = supply + vat;

  async function addInvoice() {
    if (!form.issue_date || !form.counterparty.trim() || supply <= 0) {
      setMsg("발행일·거래처·공급가액을 입력하세요.");
      return;
    }
    setBusy("add");
    setMsg("");
    const supabase = createClient();
    const { error } = await supabase.from("tax_invoices").insert({
      issue_date: form.issue_date,
      counterparty: form.counterparty.trim(),
      end_client_name: form.end_client_name || null,
      description: form.description || null,
      supply_amount: supply,
      vat_amount: vat,
      total_amount: total,
      deal_channel: form.deal_channel,
      quote_id: form.quote_id || null,
      memo: form.memo || null,
    });
    setBusy("");
    if (error) {
      setMsg(`저장 실패: ${error.message}`);
      return;
    }
    setForm({ ...EMPTY_FORM, issue_date: localDate() });
    reload();
  }

  async function updateStatus(inv: TaxInvoice, status: TaxInvoiceStatus) {
    const supabase = createClient();
    const paid_at = status === "paid" ? (inv.paid_at ?? localDate()) : null;
    await supabase
      .from("tax_invoices")
      .update({ status, paid_at, updated_at: new Date().toISOString() })
      .eq("id", inv.id);
    reload();
  }

  async function updatePaidAt(inv: TaxInvoice, paid_at: string) {
    const supabase = createClient();
    await supabase
      .from("tax_invoices")
      .update({ paid_at: paid_at || null, updated_at: new Date().toISOString() })
      .eq("id", inv.id);
    reload();
  }

  async function remove(inv: TaxInvoice) {
    if (!window.confirm(`${inv.issue_date} ${inv.counterparty} ${won(inv.total_amount)} 건을 삭제할까요?`))
      return;
    const supabase = createClient();
    const { error } = await supabase.from("tax_invoices").delete().eq("id", inv.id);
    if (error) setMsg(`삭제 실패: ${error.message}`);
    else reload();
  }

  // ── 집계 (취소 건 제외) ──────────────────────────────────
  const active = useMemo(() => invoices.filter((i) => i.status !== "cancelled"), [invoices]);
  const thisMonth = monthKey();
  const thisYear = thisMonth.slice(0, 4);
  const monthIssued = active
    .filter((i) => i.issue_date.startsWith(thisMonth))
    .reduce((s, i) => s + Number(i.total_amount), 0);
  const monthPaid = active
    .filter((i) => i.status === "paid" && (i.paid_at ?? "").startsWith(thisMonth))
    .reduce((s, i) => s + Number(i.total_amount), 0);
  const unpaid = active
    .filter((i) => i.status === "issued")
    .reduce((s, i) => s + Number(i.total_amount), 0);
  const yearIssued = active
    .filter((i) => i.issue_date.startsWith(thisYear))
    .reduce((s, i) => s + Number(i.total_amount), 0);

  // 월별 × 거래처 적층 차트 (최근 12개월, 상위 4 거래처 + 기타)
  const { chartData, series } = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => monthKey(i - 11));
    const totals = new Map<string, number>();
    for (const inv of active) {
      totals.set(inv.counterparty, (totals.get(inv.counterparty) ?? 0) + Number(inv.total_amount));
    }
    const top = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);
    const hasEtc = totals.size > top.length;
    const series = hasEtc ? [...top, "기타"] : top;

    const chartData = months.map((m) => {
      const row: Record<string, string | number> = {
        month: `${Number(m.slice(5))}월`,
      };
      for (const name of series) row[name] = 0;
      for (const inv of active) {
        if (!inv.issue_date.startsWith(m)) continue;
        const key = top.includes(inv.counterparty) ? inv.counterparty : "기타";
        if (key === "기타" && !hasEtc) continue;
        row[key] = (Number(row[key]) || 0) + Math.round(Number(inv.total_amount) / 10_000);
      }
      return row;
    });
    return { chartData, series };
  }, [active]);

  // 거래처별 올해 합계
  const byCounterparty = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of active) {
      if (!inv.issue_date.startsWith(thisYear)) continue;
      map.set(inv.counterparty, (map.get(inv.counterparty) ?? 0) + Number(inv.total_amount));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [active, thisYear]);

  const counterpartyNames = useMemo(
    () => [...new Set(invoices.map((i) => i.counterparty))],
    [invoices],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">매출</h1>
        <p className="mt-1 text-sm text-muted">
          세금계산서 발행 이력 기준 실매출 · 입금·미수금 관리 (owner 전용)
        </p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted">이번 달 발행</p>
          <p className="mt-1 text-xl font-bold text-accent-deep">{won(monthIssued)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted">이번 달 입금</p>
          <p className="mt-1 text-xl font-bold text-ink">{won(monthPaid)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted">미수금 (발행 후 미입금)</p>
          <p className={`mt-1 text-xl font-bold ${unpaid > 0 ? "text-amber-700" : "text-ink"}`}>
            {won(unpaid)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted">{thisYear}년 누적 발행</p>
          <p className="mt-1 text-xl font-bold text-ink">{won(yearIssued)}</p>
        </div>
      </div>

      {/* 월별 적층 차트 */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          월별 매출 (만원) <span className="font-normal text-muted">— 거래처별 적층, 최근 12개월</span>
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e9e7" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v, name) => [`${Number(v).toLocaleString("ko-KR")}만원`, name]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series.map((name, i) => (
                <Bar
                  key={name}
                  dataKey={name}
                  stackId="rev"
                  fill={STACK_COLORS[i % STACK_COLORS.length]}
                  radius={i === series.length - 1 ? [3, 3, 0, 0] : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {byCounterparty.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            {byCounterparty.map(([name, amount]) => (
              <span key={name} className="rounded-md border border-border px-2.5 py-1 text-xs">
                <b className="text-ink">{name}</b>{" "}
                <span className="font-mono text-accent-deep">{won(amount)}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 발행 입력 */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-ink">세금계산서 발행 입력</h2>
          {wonQuotes.length > 0 && (
            <select
              value={form.quote_id}
              onChange={(e) => prefillFromQuote(e.target.value)}
              className={input}
            >
              <option value="">수주 견적에서 불러오기 (선택)</option>
              {wonQuotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.quote_no} · {q.customer_name} · {won(Number(q.total_amount))}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">발행일 *</span>
            <input type="date" value={form.issue_date} onChange={set("issue_date")} className={`w-full ${input}`} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">거래처 * (세금계산서 상)</span>
            <input
              value={form.counterparty}
              onChange={set("counterparty")}
              list="counterparty-names"
              className={`w-full ${input}`}
            />
            <datalist id="counterparty-names">
              {counterpartyNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">실고객 (건명)</span>
            <input value={form.end_client_name} onChange={set("end_client_name")} className={`w-full ${input}`} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">구분</span>
            <select value={form.deal_channel} onChange={set("deal_channel")} className={`w-full ${input}`}>
              {DEAL_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-medium text-muted">적요</span>
            <input
              value={form.description}
              onChange={set("description")}
              placeholder="예: 홈페이지 제작 및 SEO 용역"
              className={`w-full ${input}`}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">공급가액 (원) *</span>
            <input
              type="number"
              min={0}
              step={10000}
              value={form.supply_amount}
              onChange={onSupplyChange}
              className={`w-full text-right ${input}`}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">부가세 (자동 10%, 수정 가능)</span>
            <input
              type="number"
              min={0}
              value={form.vat_amount}
              onChange={set("vat_amount")}
              className={`w-full text-right ${input}`}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={addInvoice}
            disabled={busy === "add"}
            className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
          >
            {busy === "add" ? "저장 중…" : "발행 이력 저장"}
          </button>
          <span className="text-sm text-muted">
            합계 <b className="font-mono text-accent-deep">{won(total)}</b>
          </span>
          <input
            value={form.memo}
            onChange={set("memo")}
            placeholder="메모 (선택)"
            className={`flex-1 min-w-40 ${input}`}
          />
          {msg && <span className="text-xs text-red-500">{msg}</span>}
        </div>
      </section>

      {/* 이력 테이블 */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-base font-bold text-ink">발행 이력 ({invoices.length})</h2>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted">불러오는 중…</p>
        ) : invoices.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted">
            발행 이력이 없습니다. 홈택스에서 발행한 세금계산서를 위에서 기록하세요.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">발행일</th>
                  <th className="py-2 pr-3 font-medium">거래처</th>
                  <th className="py-2 pr-3 font-medium">적요</th>
                  <th className="py-2 pr-3 text-right font-medium">공급가액</th>
                  <th className="py-2 pr-3 text-right font-medium">합계</th>
                  <th className="py-2 pr-3 font-medium">상태</th>
                  <th className="py-2 pr-3 font-medium">입금일</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className={`border-b border-border ${inv.status === "cancelled" ? "opacity-50" : ""}`}
                  >
                    <td className="py-2 pr-3 font-mono text-xs">{inv.issue_date}</td>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-ink">{inv.counterparty}</p>
                      {inv.end_client_name && (
                        <p className="text-[11px] text-muted">{inv.end_client_name}</p>
                      )}
                    </td>
                    <td className="max-w-48 truncate py-2 pr-3 text-muted" title={inv.memo ?? undefined}>
                      {inv.description ?? "-"}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {Number(inv.supply_amount).toLocaleString("ko-KR")}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono font-bold text-ink">
                      {Number(inv.total_amount).toLocaleString("ko-KR")}
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={inv.status}
                        onChange={(e) => updateStatus(inv, e.target.value as TaxInvoiceStatus)}
                        className={[
                          "rounded-md border bg-surface px-2 py-1 text-xs outline-none focus:border-accent-deep",
                          inv.status === "paid"
                            ? "border-accent-deep text-accent-deep"
                            : inv.status === "issued"
                              ? "border-amber-300 text-amber-700"
                              : "border-border text-muted",
                        ].join(" ")}
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      {inv.status === "paid" ? (
                        <input
                          type="date"
                          value={inv.paid_at ?? ""}
                          onChange={(e) => updatePaidAt(inv, e.target.value)}
                          className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent-deep"
                        />
                      ) : (
                        <span className="text-xs text-muted">-</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => remove(inv)}
                        className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-red-500"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
