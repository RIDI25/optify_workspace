"use client";

import { useState } from "react";
import { useClientContext } from "@/components/providers/client-context";
import { bulkAddKeywordsToPool } from "@/lib/actions/keywords";

/** 보관함 대량 키워드 추가 — 줄바꿈/쉼표 구분 */
export function BulkKeywordAdd({ onAdded }: { onAdded: () => void }) {
  const { selectedClientId } = useClientContext();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const keywords = [
    ...new Set(
      text
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];

  async function add() {
    if (!selectedClientId || !keywords.length) return;
    setBusy(true);
    setMsg("");
    const r = await bulkAddKeywordsToPool({ clientId: selectedClientId, keywords });
    setBusy(false);
    if (r.ok) {
      setMsg(`${r.added}개 추가${r.skipped ? ` · 중복 ${r.skipped}개 건너뜀` : ""}`);
      setText("");
      onAdded();
    } else {
      setMsg(`실패: ${r.error}`);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-sm font-medium text-accent-deep hover:underline"
        >
          {open ? "▾" : "▸"} 키워드 대량 추가
        </button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={"줄바꿈 또는 쉼표로 구분해 입력\nSEO 홈페이지 제작\n병원 마케팅, 네이버 플레이스 관리"}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
          />
          <button
            onClick={add}
            disabled={busy || !keywords.length}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "추가 중…" : `보관함에 ${keywords.length}개 추가`}
          </button>
        </div>
      )}
    </div>
  );
}
