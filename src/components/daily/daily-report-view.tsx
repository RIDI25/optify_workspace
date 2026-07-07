"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { getChannel } from "@/lib/channels";
import { addTopicToPlan, saveKeywordToPool } from "@/lib/actions/keywords";
import type { ChannelSettings } from "@/types/database";
import type { CollectResult } from "@/lib/daily-report/collect";
import type { DailyReportContent, DailyReportRow } from "@/types/daily-report";

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CHANNEL_TAG_CLS: Record<string, string> = {
  옵티파이: "bg-tint text-accent-deep",
  리디웹: "bg-sky-50 text-sky-700",
  "강의·발표": "bg-amber-50 text-amber-700",
};

type Phase = "idle" | "collecting" | "generating";

export function DailyReportView() {
  const { selectedClientId } = useClientContext();
  const today = ymdLocal(new Date());

  const [viewDate, setViewDate] = useState(today);
  const [history, setHistory] = useState<string[]>([]);
  const [collected, setCollected] = useState<CollectResult | null>(null);
  const [report, setReport] = useState<DailyReportContent | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  // 소재 제안 → 플랜/보관함 연동
  const [channels, setChannels] = useState<ChannelSettings[]>([]);
  const [planChannel, setPlanChannel] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [savedKw, setSavedKw] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedClientId) return;
    createClient()
      .from("channel_settings")
      .select("id, channel")
      .eq("client_id", selectedClientId)
      .eq("is_active", true)
      .then(({ data }) => {
        const rows = (data ?? []) as ChannelSettings[];
        setChannels(rows);
        setPlanChannel((prev) => prev || rows[0]?.channel || "");
      });
  }, [selectedClientId]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("daily_reports")
        .select("*")
        .eq("report_date", viewDate)
        .maybeSingle();
      const row = data as DailyReportRow | null;
      setReport(row?.report ?? null);
      setCollected(row?.collected ?? null);
      setError("");
      setWarning("");
    }
    void load();
  }, [viewDate]);

  useEffect(() => {
    createClient()
      .from("daily_reports")
      .select("report_date")
      .order("report_date", { ascending: false })
      .limit(14)
      .then(({ data }) =>
        setHistory(
          ((data ?? []) as { report_date: string }[]).map((r) => r.report_date),
        ),
      );
  }, [report]);

  async function generate() {
    setPhase("collecting");
    setError("");
    setWarning("");
    try {
      const cRes = await fetch("/api/daily-report/collect", { method: "POST" });
      const c = await cRes.json();
      if (!c.ok) {
        setError(c.error ?? "수집 실패");
        return;
      }
      const col = c as CollectResult;
      setCollected(col);

      setPhase("generating");
      const gRes = await fetch("/api/daily-report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, collected: col }),
      });
      const g = await gRes.json();
      if (!g.ok) {
        setError(g.error ?? "리포트 생성 실패");
        return;
      }
      setReport(g.report as DailyReportContent);
      if (g.warning) setWarning(g.warning);
      setViewDate(today);
    } catch (e) {
      setError(e instanceof Error ? e.message : "실패");
    } finally {
      setPhase("idle");
    }
  }

  async function addSuggestionToPlan(title: string) {
    if (!selectedClientId || !planChannel) return;
    const r = await addTopicToPlan({
      clientId: selectedClientId,
      channel: planChannel,
      title,
    });
    if (r.ok) setAdded((prev) => new Set(prev).add(title));
  }

  async function saveSuggestionKeyword(keyword: string) {
    if (!selectedClientId || savedKw.has(keyword)) return;
    const r = await saveKeywordToPool({
      clientId: selectedClientId,
      keyword,
      source: "daily_report",
    });
    if (r.ok) setSavedKw((prev) => new Set(prev).add(keyword));
  }

  // 소스별 수집 건수
  const perSource = new Map<string, number>();
  for (const it of collected?.items ?? []) {
    perSource.set(it.source, (perSource.get(it.source) ?? 0) + 1);
  }

  const isToday = viewDate === today;
  const busy = phase !== "idle";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">☕ 데일리 리포트</h1>
          <p className="mt-1 text-sm text-muted">
            최근 24~48시간 SEO·GEO·AI 소식 브리핑 (월요일은 72시간)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <select
              value={viewDate}
              onChange={(e) => setViewDate(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
            >
              {!history.includes(today) && <option value={today}>{today} (오늘)</option>}
              {history.map((d) => (
                <option key={d} value={d}>
                  {d}
                  {d === today ? " (오늘)" : ""}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={generate}
            disabled={busy}
            className="rounded-md bg-accent-deep px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {phase === "collecting"
              ? "소식 수집 중… (1/2)"
              : phase === "generating"
                ? "리포트 작성 중… (2/2)"
                : isToday && report
                  ? "🔄 다시 생성"
                  : "☕ 오늘 리포트 생성"}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {warning && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ {warning}
        </p>
      )}

      {!report && !busy && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">
            {isToday
              ? "아직 오늘 리포트가 없습니다. 버튼을 눌러 생성하세요."
              : "이 날짜의 리포트가 없습니다."}
          </p>
        </div>
      )}

      {/* 수집 현황 */}
      {collected && (
        <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
          <p className="text-xs font-semibold text-ink">
            수집 현황 — 최근 {collected.windowHours}시간 · 총{" "}
            {collected.items.length}건
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[...perSource.entries()].map(([s, n]) => (
              <span
                key={s}
                className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted"
              >
                {s} {n}
              </span>
            ))}
          </div>
          {collected.failures.length > 0 && (
            <p className="text-[11px] text-muted">
              직접 확인 필요:{" "}
              {collected.failures.map((f, i) => (
                <span key={f.source}>
                  {i > 0 && " · "}
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-ink"
                  >
                    {f.source}
                  </a>
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {report && (
        <>
          {/* ① 헤드라인 */}
          <section className="rounded-xl border border-accent-deep/30 bg-tint/40 p-4">
            <h2 className="mb-2 text-sm font-bold text-accent-deep">
              📌 오늘의 헤드라인
            </h2>
            <ol className="space-y-1.5">
              {report.headlines.map((h, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink">
                  <span className="font-mono font-bold text-accent-deep">
                    {i + 1}.
                  </span>
                  {h}
                </li>
              ))}
            </ol>
          </section>

          {/* ② 주요 소식 상세 */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-ink">
              주요 소식 상세 ({report.stories.length}건)
            </h2>
            {report.stories.map((s, i) => (
              <div
                key={i}
                className="space-y-2 rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-ink hover:text-accent-deep hover:underline"
                  >
                    {s.title} ↗
                  </a>
                  <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">
                    {s.source}
                  </span>
                </div>
                <DetailRow label="무엇이" text={s.what} />
                <DetailRow label="영향" text={s.impact} />
                <DetailRow label="소재 각도" text={s.angle} accent />
              </div>
            ))}
          </section>

          {/* ③ 콘텐츠 소재 제안 */}
          {report.suggestions.length > 0 && (
            <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-ink">💡 콘텐츠 소재 제안</h2>
                {selectedClientId && channels.length > 0 && (
                  <select
                    value={planChannel}
                    onChange={(e) => setPlanChannel(e.target.value)}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
                  >
                    {channels.map((c) => (
                      <option key={c.id} value={c.channel}>
                        플랜 채널: {getChannel(c.channel)?.label ?? c.channel}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {report.suggestions.map((sg, i) => (
                <div key={i} className="space-y-1.5 rounded-lg bg-subtle p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        CHANNEL_TAG_CLS[sg.channel] ?? "bg-subtle text-muted",
                      ].join(" ")}
                    >
                      {sg.channel}
                    </span>
                    <span className="text-sm font-semibold text-ink">
                      {sg.title}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    타깃 키워드: <b className="text-ink">{sg.keyword}</b> ·{" "}
                    {sg.reason}
                  </p>
                  {selectedClientId && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button
                        onClick={() => addSuggestionToPlan(sg.title)}
                        disabled={added.has(sg.title)}
                        className="rounded-md border border-accent-deep px-2.5 py-1 text-xs font-medium text-accent-deep hover:bg-tint disabled:opacity-50"
                      >
                        {added.has(sg.title) ? "✓ 플랜에 추가됨" : "플랜에 추가"}
                      </button>
                      <Link
                        href={`/generate?title=${encodeURIComponent(sg.title)}&keyword=${encodeURIComponent(sg.keyword)}`}
                        className="rounded-md bg-accent-deep px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                      >
                        ✍️ 콘텐츠 생성
                      </Link>
                      <button
                        onClick={() => saveSuggestionKeyword(sg.keyword)}
                        disabled={savedKw.has(sg.keyword)}
                        className="rounded-md border border-border px-2.5 py-1 text-xs text-ink hover:bg-surface disabled:opacity-50"
                      >
                        {savedKw.has(sg.keyword) ? "★ 보관됨" : "☆ 키워드 보관"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* ④ 패스한 소식 */}
          {report.passed.length > 0 && (
            <section className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-bold text-muted">
                패스한 소식 ({report.passed.length}건)
              </h2>
              <ul className="space-y-1">
                {report.passed.map((p, i) => (
                  <li key={i} className="text-xs text-muted">
                    <span className="text-ink">{p.title}</span> ({p.source}) —{" "}
                    {p.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function DetailRow({
  label,
  text,
  accent,
}: {
  label: string;
  text: string;
  accent?: boolean;
}) {
  return (
    <p className="flex gap-2 text-sm">
      <span
        className={[
          "w-16 shrink-0 text-xs font-medium leading-5",
          accent ? "text-accent-deep" : "text-muted",
        ].join(" ")}
      >
        {label}
      </span>
      <span className="text-ink">{text}</span>
    </p>
  );
}
