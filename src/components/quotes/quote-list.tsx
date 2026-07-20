"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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

  async function download(quote: Quote, format: "pdf" | "docx") {
    setBusyId(`${quote.id}:${format}`);
    setMsg("");
    try {
      const res = await fetch("/api/quotes/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.id,
          format,
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

  async function updateStatus(id: string, status: QuoteStatus) {
    const supabase = createClient();
    const { error } = await supabase.from("quotes").update({ status }).eq("id", id);
    if (!error) {
      setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)));
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
                  <td className="py-2 pr-3 font-medium text-ink">{q.customer_name}</td>
                  <td className="py-2 pr-3 text-muted">{q.quote_date}</td>
                  <td className="py-2 pr-3 text-right font-mono">{won(q.total_amount)}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={q.status}
                      onChange={(e) => updateStatus(q.id, e.target.value as QuoteStatus)}
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
                      <button
                        onClick={() => download(q, "pdf")}
                        disabled={!!busyId}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-subtle disabled:opacity-50"
                      >
                        {busyId === `${q.id}:pdf` ? "생성 중…" : "PDF"}
                      </button>
                      <button
                        onClick={() => download(q, "docx")}
                        disabled={!!busyId}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-subtle disabled:opacity-50"
                      >
                        {busyId === `${q.id}:docx` ? "생성 중…" : "docx"}
                      </button>
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
