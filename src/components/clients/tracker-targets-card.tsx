"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { QUESTION_INTENTS, TARGET_LIMITS, cleanTargets, parseLines, toDraft, type TargetsDraft } from "@/lib/tracker-targets";
import type { TargetQuestion, TrackerClient, TrackerJob, TrackerKeyword, TrackerPrompt, TrackerTargets } from "@/types/tracker";

/** 트래커 의도 → 화면 라벨 (되불러올 때). 브랜드형은 화면 선택지에 없어 '자동' */
const BACK_INTENT: Record<string, string | null> = { 정보형: "정보형", 지역형: "지역형", 비교추천형: "추천형", 브랜드형: null };

interface Loaded {
  clientId: string;
  missing: boolean; // 0031 표가 아직 없음
  tc: TrackerClient | null;
  lastJob: TrackerJob | null;
  saved: TargetsDraft;
  hasRow: boolean;
  prefilled: boolean; // 저장된 게 없어 맥 트래커의 현재 목록을 불러왔음
  fetchedAt: number;
}

function ago(iso: string | null, now: number): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}시간 전` : `${Math.round(h / 24)}일 전`;
}

/**
 * 측정 키워드·질문 (0031 tracker_targets) — 고객사가 요청한 메인 키워드(≤5)·서브 키워드(≤20)·질문(≤20).
 * 저장하면 tracker_jobs kind=targets 로 맥 트래커(client.yaml)에 반영되고, 그 뒤 측정은 이 목록으로 돈다.
 * 저장된 게 없으면 맥에 지금 있는 검색어·질문을 불러와 보여 준다.
 */
export function TrackerTargetsCard({ clientId }: { clientId: string }) {
  const [state, setState] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<TargetsDraft | null>(null); // 편집 중일 때만
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    (async () => {
      const [t, c, j] = await Promise.all([
        supabase.from("tracker_targets").select("*").eq("client_id", clientId).maybeSingle(),
        supabase.from("tracker_clients").select("*").eq("client_id", clientId).maybeSingle(),
        supabase.from("tracker_jobs").select("*").eq("client_id", clientId).eq("kind", "targets").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const row = (t.data ?? null) as TrackerTargets | null;
      let saved = toDraft(row);
      let prefilled = false;
      if (!row && !t.error) {
        // 맥 트래커의 현재 목록으로 미리 채운다 (검색어 표는 0031 전엔 없을 수 있다)
        const [p, k] = await Promise.all([
          supabase.from("tracker_prompts").select("*").eq("client_id", clientId).eq("active", true).order("prompt_id"),
          supabase.from("tracker_keywords").select("*").eq("client_id", clientId).eq("active", true).order("keyword_id"),
        ]);
        const prompts = (p.data ?? []) as TrackerPrompt[];
        const kws = (k.data ?? []) as TrackerKeyword[];
        const hasTier = kws.some((x) => x.tier);
        const main = kws.filter((x, i) => (hasTier ? x.tier === "main" : i < TARGET_LIMITS.main)).map((x) => x.text);
        const sub = kws.filter((x, i) => (hasTier ? x.tier !== "main" : i >= TARGET_LIMITS.main)).map((x) => x.text);
        const questions: TargetQuestion[] = prompts.map((x) => ({ text: x.text_chat || x.text_search || "", intent: x.intent ? (BACK_INTENT[x.intent] ?? null) : null })).filter((q) => q.text);
        if (main.length + sub.length + questions.length > 0) {
          saved = { main: main.slice(0, TARGET_LIMITS.main).join("\n"), sub: sub.slice(0, TARGET_LIMITS.sub).join("\n"), questions: questions.slice(0, TARGET_LIMITS.questions) };
          prefilled = true;
        }
      }
      if (!alive) return;
      setState({ clientId, missing: Boolean(t.error), tc: (c.data ?? null) as TrackerClient | null, lastJob: (j.data ?? null) as TrackerJob | null, saved, hasRow: Boolean(row), prefilled, fetchedAt: Date.now() });
    })();
    return () => {
      alive = false;
    };
  }, [clientId, tick]);

  const cur = state?.clientId === clientId ? state : null;
  const pending = cur?.lastJob?.status === "queued" || cur?.lastJob?.status === "running";
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [pending]);

  if (!cur) return <p className="text-sm text-muted">불러오는 중…</p>;
  if (cur.missing) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        측정 키워드·질문 표가 아직 없습니다. supabase/migrations/0031_tracker_targets.sql 을 SQL Editor 에서 실행하면 여기서 입력할 수 있습니다.
      </p>
    );
  }

  async function save() {
    if (!draft) return;
    const clean = cleanTargets(draft);
    if (clean.errors.length) {
      setMsg(clean.errors.join(" · "));
      return;
    }
    setBusy(true);
    setMsg("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const payload = { main_keywords: clean.main_keywords, sub_keywords: clean.sub_keywords, questions: clean.questions };
    const { error } = await supabase.from("tracker_targets").upsert({ client_id: clientId, ...payload, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
    if (error) {
      setBusy(false);
      setMsg(`저장 실패: ${error.message}`);
      return;
    }
    const job = await supabase.from("tracker_jobs").insert({ client_id: clientId, kind: "targets", params: payload, requested_by: user?.id ?? null });
    setBusy(false);
    if (job.error) {
      setMsg(`저장은 됐지만 맥에 보내지 못했습니다: ${job.error.message}`);
    } else {
      setMsg("저장했습니다. 맥이 1분 안에 받아 측정 설정에 반영합니다.");
    }
    setDraft(null);
    setBulk("");
    setTick((n) => n + 1);
  }

  const now = cur.fetchedAt;
  const job = cur.lastJob;
  const result = (job?.result ?? {}) as { keywords_active?: number; prompts_active?: number; added_prompts?: string[]; retired_prompts?: string[]; added_keywords?: string[]; retired_keywords?: string[]; deactivated_reason?: string | null; error?: string };
  const savedMain = parseLines(cur.saved.main);
  const savedSub = parseLines(cur.saved.sub);
  const editing = draft !== null;
  const counts = draft ? { main: parseLines(draft.main).length, sub: parseLines(draft.sub).length, q: draft.questions.filter((q) => q.text.trim()).length } : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 text-xs">
          {job ? (
            job.status === "done" ? (
              <p className="text-emerald-700">
                맥 반영 완료 · {ago(job.finished_at, now)} — 검색어 {result.keywords_active ?? "-"}개 · 질문 {result.prompts_active ?? "-"}개로 측정합니다
                {(result.added_prompts?.length || result.retired_prompts?.length) ? ` (질문 새로 ${result.added_prompts?.length ?? 0} · 뺌 ${result.retired_prompts?.length ?? 0})` : ""}
              </p>
            ) : job.status === "failed" ? (
              <p className="text-red-700">맥 반영 실패: {result.error ?? "이유 없음"}</p>
            ) : (
              <p className="text-accent-deep">{job.status === "queued" ? "맥 반영 대기 중 — 1분 안에 시작합니다" : "맥이 반영하는 중…"} · {ago(job.created_at, now)} 요청</p>
            )
          ) : (
            <p className="text-muted">아직 맥에 보낸 적이 없습니다.</p>
          )}
          {result.deactivated_reason && job?.status === "done" && <p className="text-amber-800">자동 실행이 꺼졌습니다: {result.deactivated_reason}. 질문·검색어를 채운 뒤 SEO·GEO 탭에서 다시 켜세요.</p>}
          {cur.tc && (
            <p className="text-muted">
              트래커 현재: 검색어 {cur.tc.keywords_active}개 · 질문 {cur.tc.prompts_active}개 · 자동 실행 {cur.tc.active ? "켜짐" : "꺼짐"} · 동기화 {ago(cur.tc.synced_at, now)}
            </p>
          )}
        </div>
        {editing ? (
          <span className="flex items-center gap-2">
            <button onClick={() => { setDraft(null); setMsg(""); }} className="rounded-md border border-border px-2.5 py-1 text-xs text-ink hover:bg-subtle">
              취소
            </button>
            <button onClick={save} disabled={busy} className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "저장 중…" : "저장하고 맥에 반영"}
            </button>
          </span>
        ) : (
          <button onClick={() => setDraft({ ...cur.saved, questions: cur.saved.questions.map((q) => ({ ...q })) })} className="text-xs text-accent-deep hover:underline">
            ✎ 수정
          </button>
        )}
      </div>
      {msg && <p className="mb-2 text-xs text-muted">{msg}</p>}

      {editing && draft && counts ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="flex justify-between text-xs font-medium text-muted">
                <span>메인 키워드 (한 줄에 하나)</span>
                <span className={counts.main > TARGET_LIMITS.main ? "text-red-600" : ""}>{counts.main}/{TARGET_LIMITS.main}</span>
              </span>
              <textarea value={draft.main} onChange={(e) => setDraft({ ...draft, main: e.target.value })} rows={5} placeholder={"예: 부산 마케팅 대행사\n병원 마케팅"} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep" />
            </label>
            <label className="space-y-1">
              <span className="flex justify-between text-xs font-medium text-muted">
                <span>서브 키워드 (한 줄에 하나)</span>
                <span className={counts.sub > TARGET_LIMITS.sub ? "text-red-600" : ""}>{counts.sub}/{TARGET_LIMITS.sub}</span>
              </span>
              <textarea value={draft.sub} onChange={(e) => setDraft({ ...draft, sub: e.target.value })} rows={5} placeholder={"예: 부산 강서구 마케팅\n소규모 병원 온라인 마케팅"} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep" />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-muted">
              <span>질문 — AI에게 물을 문장. 의도는 선택 (비우면 트래커가 문장을 보고 정함)</span>
              <span className={counts.q > TARGET_LIMITS.questions ? "text-red-600" : ""}>{counts.q}/{TARGET_LIMITS.questions}</span>
            </div>
            {draft.questions.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={q.text} onChange={(e) => setDraft({ ...draft, questions: draft.questions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} placeholder="예: 부산 연산동 한방병원 추천" className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent-deep" />
                <select value={q.intent ?? ""} onChange={(e) => setDraft({ ...draft, questions: draft.questions.map((x, j) => (j === i ? { ...x, intent: e.target.value || null } : x)) })} className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink">
                  <option value="">의도 자동</option>
                  {QUESTION_INTENTS.map((it) => (
                    <option key={it} value={it}>
                      {it}
                    </option>
                  ))}
                </select>
                <button onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })} className="text-xs text-muted hover:text-red-600" aria-label="질문 삭제">
                  ✕
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setDraft({ ...draft, questions: [...draft.questions, { text: "", intent: null }] })} disabled={draft.questions.length >= TARGET_LIMITS.questions} className="rounded-md border border-border px-2.5 py-1 text-xs text-ink hover:bg-subtle disabled:opacity-50">
                + 질문 추가
              </button>
              <span className="text-xs text-muted">여러 개를 한 번에 넣으려면 아래에 한 줄에 하나씩 붙여 넣고 &apos;추가&apos;</span>
            </div>
            <div className="flex items-start gap-2">
              <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={2} placeholder={"교통사고 한방치료 보험 적용 되나요\n부산 연산동 한방병원 추천"} className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent-deep" />
              <button
                onClick={() => {
                  const lines = parseLines(bulk);
                  if (!lines.length) return;
                  setDraft({ ...draft, questions: [...draft.questions.filter((q) => q.text.trim()), ...lines.map((text) => ({ text, intent: null }))] });
                  setBulk("");
                }}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-ink hover:bg-subtle"
              >
                추가
              </button>
            </div>
          </div>
          <p className="text-xs text-muted">저장하면 이 목록이 측정 기준이 됩니다. 여기 없는 기존 검색어·질문은 다음 측정부터 빠지고, 지난 기록은 남습니다. 문장은 고치지 말고 새로 적는 편이 추세 비교에 좋습니다.</p>
        </div>
      ) : savedMain.length + savedSub.length + cur.saved.questions.length === 0 ? (
        <p className="text-sm text-muted">아직 등록된 키워드·질문이 없습니다. 고객사가 요청한 검색어와 질문을 적어 두면 그 목록으로 측정합니다.</p>
      ) : (
        <div className="space-y-3 text-sm">
          {cur.prefilled && !cur.hasRow && <p className="rounded-md bg-tint px-3 py-1.5 text-xs text-accent-deep">맥 트래커에 지금 있는 목록을 불러왔습니다. 수정 후 저장하면 이 목록이 기준이 됩니다.</p>}
          <div>
            <p className="mb-1 text-xs font-medium text-muted">메인 키워드 {savedMain.length}</p>
            <div className="flex flex-wrap gap-1.5">
              {savedMain.map((k) => (
                <span key={k} className="rounded-md bg-tint px-2 py-0.5 text-xs font-medium text-accent-deep">
                  {k}
                </span>
              ))}
              {savedMain.length === 0 && <span className="text-xs text-muted">없음</span>}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">서브 키워드 {savedSub.length}</p>
            <div className="flex flex-wrap gap-1.5">
              {savedSub.map((k) => (
                <span key={k} className="rounded-md bg-subtle px-2 py-0.5 text-xs text-ink">
                  {k}
                </span>
              ))}
              {savedSub.length === 0 && <span className="text-xs text-muted">없음</span>}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">질문 {cur.saved.questions.length}</p>
            <ol className="space-y-1">
              {cur.saved.questions.map((q, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs text-muted">{i + 1}.</span>
                  <span className="text-ink">{q.text}</span>
                  <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[11px] text-muted">{q.intent ?? "의도 자동"}</span>
                </li>
              ))}
              {cur.saved.questions.length === 0 && <li className="text-xs text-muted">없음</li>}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
