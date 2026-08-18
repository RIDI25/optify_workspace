"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { channelLabel } from "@/lib/channels";
import { createBulkPlans } from "@/lib/actions/plans";
import { PlanImport } from "@/components/plans/plan-import";
import type { ChannelSettings } from "@/types/database";

const input =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent-deep";

/** 다음 달 1일 / 말일 */
function nextMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
}

/** 기간에 N개 날짜를 균등 배분 (주말 제외 옵션: 토·일이면 다음 평일로) */
function distributeDates(start: string, end: string, n: number, skipWeekends: boolean): string[] {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const span = Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000));
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const offset = n === 1 ? 0 : Math.round((i * span) / (n - 1));
    const d = new Date(s);
    d.setDate(d.getDate() + offset);
    if (skipWeekends) {
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    }
    dates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  return dates;
}

export function PlanTools({ onCreated }: { onCreated: () => void }) {
  const { selectedClientId, selectedClient } = useClientContext();
  const [open, setOpen] = useState<"" | "generate" | "import" | "export">("");
  const [channels, setChannels] = useState<ChannelSettings[]>([]);

  // 월간 플랜 생성기
  const range = nextMonthRange();
  const [channel, setChannel] = useState("");
  const [start, setStart] = useState(range.start);
  const [end, setEnd] = useState(range.end);
  const [count, setCount] = useState(8);
  const [keywordsText, setKeywordsText] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  // 계획서 출력
  const [exStart, setExStart] = useState(range.start);
  const [exEnd, setExEnd] = useState(range.end);

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
        setChannel((prev) => prev || rows[0]?.channel || "");
      });
  }, [selectedClientId]);

  const keywords = [
    ...new Set(
      keywordsText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];

  async function loadPoolKeywords() {
    if (!selectedClientId) return;
    const { data } = await createClient()
      .from("keywords")
      .select("keyword")
      .eq("client_id", selectedClientId)
      .eq("status", "candidate")
      .order("created_at", { ascending: false })
      .limit(50);
    const pool = ((data ?? []) as { keyword: string }[]).map((k) => k.keyword);
    if (!pool.length) {
      setMsg("보관함에 후보 키워드가 없습니다.");
      return;
    }
    setKeywordsText((prev) =>
      [...new Set([...prev.split(/[\n,]/).map((s) => s.trim()).filter(Boolean), ...pool])].join("\n"),
    );
  }

  async function generate() {
    if (!selectedClientId || !channel) return;
    if (!keywords.length) {
      setMsg("키워드를 입력하세요 (줄바꿈/쉼표 구분).");
      return;
    }
    const n = Math.min(count, keywords.length);
    if (count > keywords.length) {
      setMsg(`키워드가 ${keywords.length}개라 ${keywords.length}건으로 생성합니다.`);
    }
    setBusy("generate");
    try {
      const chosen = keywords.slice(0, n);
      // 제목: AI 일괄 생성 (실패 시 키워드 그대로)
      let titleMap = new Map<string, string>();
      if (useAi) {
        setMsg("AI 제목 생성 중…");
        try {
          const res = await fetch("/api/plans/titles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId: selectedClientId, channel, keywords: chosen }),
          });
          const d = await res.json();
          if (d.ok) {
            titleMap = new Map(
              (d.titles as { keyword: string; title: string }[]).map((t) => [t.keyword, t.title]),
            );
          }
        } catch {
          // 폴백: 키워드 제목
        }
      }
      const dates = distributeDates(start, end, n, skipWeekends);
      const items = chosen.map((keyword, i) => ({
        keyword,
        title: titleMap.get(keyword) || keyword,
        date: dates[i],
      }));
      setMsg("플랜 저장 중…");
      const r = await createBulkPlans({ clientId: selectedClientId, channel, items });
      if (r.ok) {
        setMsg(`${r.count}건 생성 완료 — 캘린더에 반영됐습니다. 발행일에 검토 후 발행 처리하세요.`);
        setKeywordsText("");
        onCreated();
      } else {
        setMsg(`실패: ${r.error}`);
      }
    } finally {
      setBusy("");
    }
  }

  async function exportSchedule() {
    if (!selectedClientId) return;
    setBusy("export");
    setMsg("");
    try {
      const res = await fetch("/api/plans/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          clientName: selectedClient?.name ?? "",
          start: exStart,
          end: exEnd,
        }),
      });
      if (!res.ok || res.headers.get("Content-Type")?.includes("json")) {
        const d = await res.json().catch(() => ({ error: "출력 실패" }));
        setMsg(`계획서 실패: ${d.error ?? "알 수 없음"}`);
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `콘텐츠발행계획서_${selectedClient?.name ?? ""}_${exStart}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen(open === "generate" ? "" : "generate")}
          className={[
            "rounded-md border px-3 py-1.5 text-sm font-medium",
            open === "generate"
              ? "border-accent-deep bg-tint text-accent-deep"
              : "border-accent-deep text-accent-deep hover:bg-tint",
          ].join(" ")}
        >
          📅 월간 플랜 자동 생성
        </button>
        <button
          onClick={() => setOpen(open === "import" ? "" : "import")}
          className={[
            "rounded-md border px-3 py-1.5 text-sm font-medium",
            open === "import"
              ? "border-accent-deep bg-tint text-accent-deep"
              : "border-border text-ink hover:bg-subtle",
          ].join(" ")}
        >
          📥 엑셀 업로드
        </button>
        <button
          onClick={() => setOpen(open === "export" ? "" : "export")}
          className={[
            "rounded-md border px-3 py-1.5 text-sm font-medium",
            open === "export"
              ? "border-accent-deep bg-tint text-accent-deep"
              : "border-border text-ink hover:bg-subtle",
          ].join(" ")}
        >
          📄 발행 계획서 출력 (고객 제출용)
        </button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>

      {open === "generate" && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">채널</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className={`w-full ${input}`}>
                {channels.map((c) => (
                  <option key={c.channel} value={c.channel}>
                    {channelLabel(c.channel)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">시작일</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`w-full ${input}`} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">종료일</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={`w-full ${input}`} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">콘텐츠 개수</span>
              <input
                type="number"
                min={1}
                max={31}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
                className={`w-full ${input}`}
              />
            </label>
            <div className="space-y-1.5 pt-4 text-xs text-ink">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="accent-[#057A4E]" />
                AI 제목 생성
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={skipWeekends} onChange={(e) => setSkipWeekends(e.target.checked)} className="accent-[#057A4E]" />
                주말 제외
              </label>
            </div>
          </div>
          <label className="block space-y-1">
            <span className="flex items-center gap-2 text-xs font-medium text-muted">
              키워드 (줄바꿈/쉼표 구분, {keywords.length}개)
              <button
                onClick={loadPoolKeywords}
                className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-subtle"
              >
                ⭐ 보관함에서 불러오기
              </button>
            </span>
            <textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              rows={4}
              placeholder={"SEO 홈페이지 제작\n병원 마케팅\n네이버 플레이스 관리"}
              className={`w-full ${input}`}
            />
          </label>
          <button
            onClick={generate}
            disabled={!!busy || !keywords.length}
            className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
          >
            {busy === "generate" ? "생성 중…" : `플랜 ${Math.min(count, keywords.length) || 0}건 생성`}
          </button>
          <p className="text-[11px] text-muted">
            키워드당 1건씩, 기간에 균등 배분해 캘린더에 등록됩니다. 발행 예정일에는 해당 날짜를
            클릭해 검토 후 발행 처리만 하면 됩니다.
          </p>
        </div>
      )}

      {open === "import" && (
        <PlanImport channels={channels} onCreated={onCreated} />
      )}

      {open === "export" && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">시작일</span>
            <input type="date" value={exStart} onChange={(e) => setExStart(e.target.value)} className={`block ${input}`} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">종료일</span>
            <input type="date" value={exEnd} onChange={(e) => setExEnd(e.target.value)} className={`block ${input}`} />
          </label>
          <button
            onClick={exportSchedule}
            disabled={!!busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
          >
            {busy === "export" ? "생성 중…" : "PDF 다운로드"}
          </button>
          <span className="text-[11px] text-muted">
            기간 내 발행 예정 플랜을 고객 제출용 계획서(옵티파이 브랜딩)로 출력합니다.
          </span>
        </div>
      )}
    </div>
  );
}
