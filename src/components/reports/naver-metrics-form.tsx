"use client";

import { useState } from "react";
import type { NaverManualMetrics } from "@/types/database";

export function defaultNaverMetrics(): NaverManualMetrics {
  return {
    blog_total_views: 0,
    blog_visitor_count: 0,
    top_inflow_keywords: [],
    place_views: null,
    place_inquiries: null,
    note: "",
  };
}

function fileToBase64(file: File): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [meta, data] = result.split(",");
      const mediaType = meta.match(/data:(.*?);/)?.[1] ?? "image/png";
      resolve({ data, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function NaverMetricsForm({
  clientId,
  value,
  onChange,
}: {
  clientId: string;
  value: NaverManualMetrics;
  onChange: (v: NaverManualMetrics) => void;
}) {
  const [extracting, setExtracting] = useState(false);
  const [msg, setMsg] = useState("");

  const kws = value.top_inflow_keywords ?? [];
  const rows = [...kws, ...Array(Math.max(0, 5 - kws.length)).fill({ keyword: "", count: 0 })].slice(0, 5);

  function set<K extends keyof NaverManualMetrics>(k: K, v: NaverManualMetrics[K]) {
    onChange({ ...value, [k]: v });
  }
  function setKeyword(i: number, patch: Partial<{ keyword: string; count: number }>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange({ ...value, top_inflow_keywords: next.filter((r) => r.keyword.trim()) });
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setMsg("");
    try {
      const { data, mediaType } = await fileToBase64(file);
      const res = await fetch("/api/reports/extract-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, imageBase64: data, mediaType }),
      });
      const d = await res.json();
      if (d.ok && d.metrics) {
        onChange({
          ...value,
          blog_total_views: d.metrics.blog_total_views ?? value.blog_total_views,
          blog_visitor_count:
            d.metrics.blog_visitor_count ?? value.blog_visitor_count,
          top_inflow_keywords: Array.isArray(d.metrics.top_inflow_keywords)
            ? d.metrics.top_inflow_keywords.slice(0, 5)
            : value.top_inflow_keywords,
        });
        setMsg("스크린샷에서 수치를 채웠어요. 값을 확인·수정하세요.");
      } else {
        setMsg(`추출 실패: ${d.error ?? "알 수 없음"}`);
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "추출 실패");
    } finally {
      setExtracting(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-md border border-accent-deep px-3 py-1.5 text-sm font-medium text-accent-deep hover:bg-tint">
          {extracting ? "추출 중…" : "스크린샷에서 자동 채우기"}
          <input
            type="file"
            accept="image/*"
            onChange={onUpload}
            disabled={extracting}
            className="hidden"
          />
        </label>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumField
          label="블로그 총 조회수"
          value={value.blog_total_views}
          onChange={(n) => set("blog_total_views", n)}
        />
        <NumField
          label="방문자 수"
          value={value.blog_visitor_count}
          onChange={(n) => set("blog_visitor_count", n)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">상위 유입 키워드 (5개)</p>
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={r.keyword}
              onChange={(e) => setKeyword(i, { keyword: e.target.value })}
              placeholder={`키워드 ${i + 1}`}
              className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent-deep"
            />
            <input
              type="number"
              value={r.count || ""}
              onChange={(e) => setKeyword(i, { count: Number(e.target.value) || 0 })}
              placeholder="유입수"
              className="w-28 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent-deep"
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumField
          label="플레이스 조회수 (선택)"
          value={value.place_views ?? 0}
          onChange={(n) => set("place_views", n || null)}
        />
        <NumField
          label="플레이스 문의 (선택)"
          value={value.place_inquiries ?? 0}
          onChange={(n) => set("place_inquiries", n || null)}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink">메모</label>
        <textarea
          value={value.note}
          onChange={(e) => set("note", e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
        />
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink">{label}</label>
      <input
        type="number"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
      />
    </div>
  );
}
