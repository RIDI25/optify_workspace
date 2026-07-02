"use client";

import { useState } from "react";

export function ReportExport({
  clientId,
  clientName,
  yearMonth,
  report,
}: {
  clientId: string;
  clientName: string;
  yearMonth: string;
  report: Record<string, unknown>;
}) {
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");

  async function exportAs(format: "pdf" | "docx") {
    setBusy(format);
    setMsg("");
    try {
      const res = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientName,
          yearMonth,
          format,
          report,
          exportedAt: new Date().toISOString(),
        }),
      });
      const d = await res.json();
      if (d.ok && d.url) {
        window.open(d.url, "_blank");
        setMsg(`${format.toUpperCase()} 생성 완료`);
      } else {
        setMsg(`실패: ${d.error ?? "알 수 없음"}`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "내보내기 실패");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => exportAs("pdf")}
        disabled={!!busy}
        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-subtle disabled:opacity-50"
      >
        {busy === "pdf" ? "PDF 생성 중…" : "PDF 내보내기"}
      </button>
      <button
        onClick={() => exportAs("docx")}
        disabled={!!busy}
        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-subtle disabled:opacity-50"
      >
        {busy === "docx" ? "docx 생성 중…" : "docx 내보내기"}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
