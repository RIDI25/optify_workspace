"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientBrief } from "@/types/database";

const FIELDS: { key: keyof Pick<ClientBrief, "tone" | "audience" | "must_include" | "banned" | "notes">; label: string; placeholder: string; rows: number }[] = [
  { key: "tone", label: "말투", placeholder: "예: 차분하고 전문적, '~합니다' 기본, 과장 없이", rows: 2 },
  { key: "audience", label: "독자", placeholder: "예: 40~60대 만성 통증 환자와 보호자", rows: 2 },
  { key: "must_include", label: "꼭 넣을 것", placeholder: "예: 진료 시간, 예약 전화, 주차 안내", rows: 2 },
  { key: "banned", label: "금지 표현", placeholder: "예: 완치, 100%, 최고, 유일한", rows: 2 },
  { key: "notes", label: "참고", placeholder: "예: 참고할 글 링크, 주의할 점, 브랜드 어휘", rows: 3 },
];

type Draft = Record<(typeof FIELDS)[number]["key"], string>;
const empty = (): Draft => ({ tone: "", audience: "", must_include: "", banned: "", notes: "" });

/**
 * 콘텐츠 기준 — 고객사별 글쓰기 기준 네 칸 + 참고. 생성 엔진이 시스템 프롬프트에 넣는다 (0028 client_briefs).
 * 비워 둬도 되고, 채운 칸만 반영된다.
 */
export function ClientBriefCard({ clientId }: { clientId: string }) {
  const [state, setState] = useState<{ id: string; draft: Draft; saved: Draft; missing: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let active = true;
    createClient()
      .from("client_briefs")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        const row = data as ClientBrief | null;
        const d: Draft = row
          ? { tone: row.tone ?? "", audience: row.audience ?? "", must_include: row.must_include ?? "", banned: row.banned ?? "", notes: row.notes ?? "" }
          : empty();
        setState({ id: clientId, draft: d, saved: d, missing: !!error });
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  const cur = state?.id === clientId ? state : null;
  if (!cur) return <p className="text-sm text-muted">불러오는 중…</p>;
  if (cur.missing) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        콘텐츠 기준 표가 아직 없습니다. supabase/migrations/0028_client_brief.sql 을 SQL Editor 에서 실행하면 여기서 입력할 수 있습니다.
      </p>
    );
  }

  async function save() {
    if (!cur) return;
    setBusy(true);
    setMsg("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const patch = Object.fromEntries(Object.entries(cur.draft).map(([k, v]) => [k, v.trim() || null]));
    const { error } = await supabase
      .from("client_briefs")
      .upsert({ client_id: clientId, ...patch, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
    setBusy(false);
    if (error) {
      setMsg(`저장 실패: ${error.message}`);
      return;
    }
    setState({ ...cur, saved: cur.draft });
    setEditing(false);
    setMsg("저장됨");
    setTimeout(() => setMsg(""), 1500);
  }

  const filled = FIELDS.filter((f) => cur.saved[f.key].trim());

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted">채운 칸만 글 생성에 반영됩니다. 채널 프리셋보다 우선합니다.</p>
        {editing ? (
          <span className="flex items-center gap-2">
            <button
              onClick={() => {
                setState({ ...cur, draft: cur.saved });
                setEditing(false);
              }}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-ink hover:bg-subtle"
            >
              취소
            </button>
            <button onClick={save} disabled={busy} className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "저장 중…" : "저장"}
            </button>
          </span>
        ) : (
          <button onClick={() => setEditing(true)} className="text-xs text-accent-deep hover:underline">
            ✎ 수정
          </button>
        )}
      </div>
      {msg && <p className="mb-2 text-xs text-muted">{msg}</p>}
      {editing ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className={["space-y-1", f.key === "notes" ? "md:col-span-2" : ""].join(" ")}>
              <span className="text-xs font-medium text-muted">{f.label}</span>
              <textarea
                value={cur.draft[f.key]}
                onChange={(e) => setState({ ...cur, draft: { ...cur.draft, [f.key]: e.target.value } })}
                rows={f.rows}
                placeholder={f.placeholder}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
              />
            </label>
          ))}
        </div>
      ) : filled.length === 0 ? (
        <p className="text-sm text-muted">아직 비어 있습니다. 말투·독자·꼭 넣을 것·금지 표현을 적어 두면 이 고객사 글에 그대로 반영됩니다.</p>
      ) : (
        <dl className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-1.5 text-sm">
          {filled.map((f) => (
            <div key={f.key} className="contents">
              <dt className="text-muted">{f.label}</dt>
              <dd className="whitespace-pre-wrap text-ink">{cur.saved[f.key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
