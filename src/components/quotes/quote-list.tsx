"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dealGroupLabel } from "@/lib/deal-channels";
import { won } from "@/lib/export/quote-model";
import type { Quote, QuoteStatus } from "@/types/database";

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "작성",
  sent: "발송",
  won: "수주",
  expired: "만료",
};

export function QuoteList({
  refreshKey,
  onCopy,
}: {
  refreshKey: number;
  onCopy: (quote: Quote) => void;
}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase
      .from("quotes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!active) return;
        setQuotes((data ?? []) as Quote[]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  async function generateDoc(
    quote: Quote,
    format: "pdf" | "docx",
    docType: "quote" | "contract" | "invoice" = "quote",
    stage: "full" | "deposit" | "balance" = "full",
  ) {
    setBusyId(quote.id);
    setMsg("");
    try {
      const res = await fetch("/api/quotes/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.id,
          format,
          docType,
          stage,
          exportedAt: new Date().toISOString(),
        }),
      });
      const d = await res.json();
      if (d.ok && d.url) window.open(d.url, "_blank");
      else setMsg(`실패: ${d.error ?? "알 수 없음"}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "다운로드 실패");
    } finally {
      setBusyId("");
    }
  }

  async function updateStatus(quote: Quote, status: QuoteStatus) {
    const supabase = createClient();
    const won_at = status === "won" ? new Date().toISOString() : null;
    const { error } = await supabase
      .from("quotes")
      .update({ status, won_at, updated_at: new Date().toISOString() })
      .eq("id", quote.id);
    if (error) return;
    setQuotes((prev) => prev.map((q) => (q.id === quote.id ? { ...q, status, won_at } : q)));
    // 리드 연결 견적이 수주되면 리드도 수주로 동기화
    if (status === "won" && quote.lead_id) {
      await supabase
        .from("leads")
        .update({ status: "won", updated_at: new Date().toISOString() })
        .eq("id", quote.lead_id);
    }
  }

  async function remove(quote: Quote) {
    if (!window.confirm(`${quote.quote_no} (${quote.customer_name}) 견적을 삭제할까요?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("quotes").delete().eq("id", quote.id);
    if (error) setMsg(`삭제 실패: ${error.message}`);
    else setQuotes((prev) => prev.filter((q) => q.id !== quote.id));
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">견적 내역</h2>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted">불러오는 중…</p>
      ) : quotes.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted">
          발행한 견적서가 없습니다. 위에서 첫 견적서를 작성해 보세요.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">견적번호</th>
                <th className="py-2 pr-3 font-medium">고객사명</th>
                <th className="py-2 pr-3 font-medium">견적일</th>
                <th className="py-2 pr-3 text-right font-medium">합계 (VAT 포함)</th>
                <th className="py-2 pr-3 font-medium">상태</th>
                <th className="py-2 font-medium">문서</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b border-border">
                  <td className="py-2 pr-3 font-mono text-xs text-ink">{q.quote_no}</td>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-ink">{q.customer_name}</p>
                    <p className="text-[11px] text-muted">
                      {q.deal_channel && q.deal_channel !== "direct"
                        ? dealGroupLabel(q.deal_channel, q.partner_name)
                        : ""}
                      {q.end_client_name ? `${q.deal_channel !== "direct" ? " · " : ""}${q.end_client_name}` : ""}
                    </p>
                  </td>
                  <td className="py-2 pr-3 text-muted">{q.quote_date}</td>
                  <td className="py-2 pr-3 text-right font-mono">{won(q.total_amount)}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={q.status}
                      onChange={(e) => updateStatus(q, e.target.value as QuoteStatus)}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent-deep"
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-1.5">
                      <select
                        value=""
                        disabled={!!busyId}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          const [docType, format, stage] = v.split(":") as [
                            "quote" | "contract" | "invoice",
                            "pdf" | "docx",
                            "full" | "deposit" | "balance" | undefined,
                          ];
                          generateDoc(q, format, docType, stage ?? "full");
                          e.target.value = "";
                        }}
                        className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent-deep disabled:opacity-50"
                      >
                        <option value="">
                          {busyId === q.id ? "생성 중…" : "문서 생성…"}
                        </option>
                        <option value="quote:pdf">견적서 PDF</option>
                        <option value="quote:docx">견적서 docx</option>
                        <option value="contract:pdf">계약서 PDF</option>
                        <option value="contract:docx">계약서 docx</option>
                        <option value="invoice:pdf:full">청구서 (전액)</option>
                        <option value="invoice:pdf:deposit">청구서 (계약금 50%)</option>
                        <option value="invoice:pdf:balance">청구서 (잔금 50%)</option>
                      </select>
                      <button
                        onClick={() => onCopy(q)}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-subtle"
                        title="이 견적 내용으로 새 견적 작성"
                      >
                        복사
                      </button>
                      <button
                        onClick={() => remove(q)}
                        className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-red-500"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
