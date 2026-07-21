"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { won } from "@/lib/export/quote-model";
import type { Lead, Quote } from "@/types/database";
import { LeadPipeline } from "@/components/sales/lead-pipeline";

const TARGET_KEY = "monthly_revenue_target";
const DEFAULT_TARGET = 10_000_000;

function localMonth(offset = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 수주 월 기준: won_at 우선, 없으면 견적일 */
const wonMonth = (q: Quote) => ((q.won_at ?? q.quote_date) || "").slice(0, 7);

export function SalesView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [leadsRes, quotesRes, settingRes] = await Promise.all([
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("quotes").select("*").order("created_at", { ascending: false }),
      supabase.from("app_settings").select("value").eq("key", TARGET_KEY).maybeSingle(),
    ]);
    setLeads((leadsRes.data ?? []) as Lead[]);
    setQuotes((quotesRes.data ?? []) as Quote[]);
    const t = Number(settingRes.data?.value);
    if (t > 0) setTarget(t);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function saveTarget() {
    const t = Number(targetInput.replaceAll(",", ""));
    setEditingTarget(false);
    setTargetInput("");
    if (!t || t <= 0) return;
    setTarget(t);
    const supabase = createClient();
    await supabase.from("app_settings").upsert({
      key: TARGET_KEY,
      value: String(t),
      updated_at: new Date().toISOString(),
    });
  }

  const thisMonth = localMonth();
  const wonQuotes = quotes.filter((q) => q.status === "won");
  const monthWonSum = wonQuotes
    .filter((q) => wonMonth(q) === thisMonth)
    .reduce((s, q) => s + Number(q.total_amount), 0);
  const pipelineSum = quotes
    .filter((q) => q.status === "sent")
    .reduce((s, q) => s + Number(q.total_amount), 0);
  // 월 반복 매출 추정: 수주 견적의 월 단위 품목 합 (계약 종료는 견적 상태 '만료'로 반영)
  const mrr = wonQuotes.reduce(
    (s, q) => s + q.items.filter((it) => it.unit === "월").reduce((a, it) => a + it.amount, 0),
    0,
  );
  const progress = target > 0 ? Math.min(100, Math.round((monthWonSum / target) * 100)) : 0;

  const chartData = Array.from({ length: 6 }, (_, i) => {
    const m = localMonth(i - 5);
    return {
      month: `${Number(m.slice(5))}월`,
      수주액: Math.round(
        wonQuotes.filter((q) => wonMonth(q) === m).reduce((s, q) => s + Number(q.total_amount), 0) /
          10_000,
      ),
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">영업·리드</h1>
        <p className="mt-1 text-sm text-muted">
          리드 파이프라인 · 수주 현황 · 매출 목표 (owner 전용)
        </p>
      </div>

      {/* 매출 요약 카드 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted">이번 달 수주</p>
          <p className="mt-1 text-xl font-bold text-accent-deep">{won(monthWonSum)}</p>
          <div className="mt-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            {editingTarget ? (
              <span className="mt-1 flex items-center gap-1">
                <input
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveTarget()}
                  placeholder={String(target)}
                  autoFocus
                  className="w-28 rounded border border-border px-1.5 py-0.5 text-xs outline-none focus:border-accent-deep"
                />
                <button onClick={saveTarget} className="text-xs text-accent-deep">
                  저장
                </button>
              </span>
            ) : (
              <button
                onClick={() => setEditingTarget(true)}
                className="mt-1 text-xs text-muted hover:text-accent-deep"
                title="클릭해서 목표 수정"
              >
                목표 {won(target)} · 달성 {progress}%
              </button>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted">파이프라인 (발송 견적)</p>
          <p className="mt-1 text-xl font-bold text-ink">{won(pipelineSum)}</p>
          <p className="mt-1 text-xs text-muted">
            발송 상태 견적 {quotes.filter((q) => q.status === "sent").length}건 합계
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted">월 반복 매출 추정</p>
          <p className="mt-1 text-xl font-bold text-ink">{won(mrr)}</p>
          <p className="mt-1 text-xs text-muted">수주 견적의 월 단위 품목 합</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted">진행 중 리드</p>
          <p className="mt-1 text-xl font-bold text-ink">
            {leads.filter((l) => !["won", "lost"].includes(l.status)).length}건
          </p>
          <p className="mt-1 text-xs text-muted">
            수주 {leads.filter((l) => l.status === "won").length} · 실패{" "}
            {leads.filter((l) => l.status === "lost").length}
          </p>
        </div>
      </div>

      {/* 월별 수주 추이 */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">월별 수주 금액 (만원)</h2>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e9e7" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v) => [`${Number(v).toLocaleString("ko-KR")}만원`, "수주액"]} />
              <Bar dataKey="수주액" fill="#057A4E" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 리드 파이프라인 */}
      {loading ? (
        <p className="py-6 text-center text-sm text-muted">불러오는 중…</p>
      ) : (
        <LeadPipeline leads={leads} quotes={quotes} onChanged={reload} />
      )}
    </div>
  );
}
