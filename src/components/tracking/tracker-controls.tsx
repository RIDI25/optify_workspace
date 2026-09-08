"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { surfaceLabel } from "@/lib/tracker";
import type { TrackerClient, TrackerJob, TrackerWorker } from "@/types/tracker";
import type { TrackingScope } from "./tracking-view";

const SCOPE_SURFACES: Record<TrackingScope, string[]> = {
  seo: ["naver_web", "google_web"],
  geo: ["naver_aib", "google_aio", "google_aimode"],
};
const LLM_SURFACES = ["chatgpt", "gemini", "perplexity", "claude"];
const KIND_LABEL: Record<string, string> = { run: "측정 실행", settings: "설정 저장", report: "리포트 생성", sync: "다시 올리기", targets: "키워드·질문 반영" };
const STATUS_LABEL: Record<string, string> = { queued: "대기", running: "실행 중", done: "완료", failed: "실패" };
const STATUS_CLS: Record<string, string> = {
  queued: "bg-subtle text-muted",
  running: "bg-tint text-accent-deep",
  done: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "기록 없음";
  const min = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

/**
 * 트래커 자동 실행 설정 + 지금 실행 (트래커 B단계).
 * 요청은 tracker_jobs 에 쌓이고 맥의 워커(`tracker jobs`, 1분마다)가 처리한다. 이 화면은 결과를 10초마다 확인한다.
 */
export function TrackerControls({
  clientId,
  scope,
  tc,
  onJobDone,
}: {
  clientId: string;
  scope: TrackingScope;
  tc: TrackerClient | null;
  onJobDone?: () => void;
}) {
  const scopeSurfaces = SCOPE_SURFACES[scope];
  const [active, setActive] = useState<boolean>(tc?.active ?? false);
  const [on, setOn] = useState<Set<string>>(() => new Set((tc?.enabled_surfaces ?? []).filter((s) => scopeSurfaces.includes(s) || LLM_SURFACES.includes(s))));
  // fetchedAt: 렌더 중 Date.now() 를 부르지 않기 위해 불러온 시각을 같이 둔다
  const [jobs, setJobs] = useState<{ clientId: string; rows: TrackerJob[]; worker: TrackerWorker | null; missing: boolean; fetchedAt: number }>({
    clientId: "",
    rows: [],
    worker: null,
    missing: false,
    fetchedAt: 0,
  });
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<"run" | "settings" | null>(null);
  const [msg, setMsg] = useState("");
  const [openLog, setOpenLog] = useState<string | null>(null);
  const [seenDone, setSeenDone] = useState<Set<string>>(new Set());

  // 요청 목록 + 워커 상태. 대기·실행 중 요청이 있으면 10초마다 다시 본다
  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("tracker_jobs").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(6),
      supabase.from("tracker_worker").select("*").eq("id", "mac").maybeSingle(),
    ]).then(([j, w]) => {
      if (!alive) return;
      setJobs({ clientId, rows: (j.data ?? []) as TrackerJob[], worker: (w.data ?? null) as TrackerWorker | null, missing: Boolean(j.error), fetchedAt: Date.now() });
    });
    return () => {
      alive = false;
    };
  }, [clientId, tick]);

  const rows = jobs.clientId === clientId ? jobs.rows : [];
  const pending = rows.some((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [pending]);

  // 방금 끝난 요청이 있으면 부모(실행 이력·지표)를 새로 읽게 한다
  useEffect(() => {
    const finished = rows.filter((r) => (r.status === "done" || r.status === "failed") && !seenDone.has(r.id));
    if (finished.length === 0) return;
    const t = setTimeout(() => {
      setSeenDone((prev) => new Set([...prev, ...finished.map((r) => r.id)]));
      if (finished.some((r) => r.status === "done" && r.kind !== "settings")) onJobDone?.();
      if (finished.some((r) => r.kind === "settings" && r.status === "done")) onJobDone?.();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const worker = jobs.clientId === clientId ? jobs.worker : null;
  const now = jobs.fetchedAt;
  const workerMin = worker?.last_seen ? Math.round((now - new Date(worker.last_seen).getTime()) / 60_000) : null;
  const workerOk = workerMin != null && workerMin <= 5;

  const enabledInScope = (tc?.enabled_surfaces ?? []).filter((s) => scopeSurfaces.includes(s) || (scope === "geo" && LLM_SURFACES.includes(s)));

  async function enqueue(kind: "run" | "settings", params: Record<string, unknown>) {
    setBusy(kind);
    setMsg("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("tracker_jobs").insert({ client_id: clientId, kind, params, requested_by: user?.id ?? null });
    setBusy(null);
    if (error) {
      setMsg(`요청을 넣지 못했습니다: ${error.message}`);
      return;
    }
    setMsg(kind === "run" ? "실행 요청을 보냈습니다. 맥이 1분 안에 받아 시작합니다." : "설정 요청을 보냈습니다. 맥이 반영하면 아래에 '완료'로 표시됩니다.");
    setTick((n) => n + 1);
  }

  function runNow() {
    void enqueue("run", { surfaces: enabledInScope, scope });
  }
  function saveSettings() {
    const surfaces: Record<string, unknown> = {};
    for (const s of scopeSurfaces) surfaces[s] = on.has(s);
    if (scope === "geo") surfaces.llm_api = LLM_SURFACES.filter((s) => on.has(s));
    void enqueue("settings", { active, surfaces });
  }
  const toggle = (s: string) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  if (jobs.clientId === clientId && jobs.missing) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        실행 요청 표가 없습니다. supabase/migrations/0025_tracker.sql 이 실행돼 있어야 합니다.
      </p>
    );
  }

  return (
    <section className="rounded-lg border border-accent/30 bg-tint/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={runNow}
              disabled={!tc || busy !== null || enabledInScope.length === 0 || pending}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              title={!tc ? "맥 트래커에서 고객사를 먼저 등록하세요" : enabledInScope.length === 0 ? "켜진 표면이 없습니다 — 아래에서 켜고 저장하세요" : pending ? "앞선 요청이 끝나면 다시 누를 수 있습니다" : ""}
            >
              {busy === "run" ? "보내는 중…" : `${scope === "seo" ? "SEO" : "GEO"} 지금 실행`}
            </button>
            <span className="text-xs text-muted">
              {enabledInScope.length ? `측정: ${enabledInScope.map(surfaceLabel).join(" · ")}` : "켜진 표면 없음"}
            </span>
          </div>
          <p className="text-xs text-muted">
            네이버·구글은 항목당 10~20초, AI 4종은 질문당 30초~2분 걸립니다. 결과는 아래 요청 목록과 탭에 나타납니다.
          </p>
        </div>
        <div className={["rounded-md px-2.5 py-1 text-xs", workerOk || pending ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"].join(" ")}>
          {worker
            ? workerOk
              ? `맥 워커 · ${ago(worker.last_seen, now)} 확인${worker.note?.startsWith("작업 처리 중") ? " · 작업 처리 중" : ""}`
              : pending
                ? `맥 워커가 요청을 처리하는 중 · 마지막 확인 ${ago(worker.last_seen, now)}`
                : `맥 워커 응답 없음 · 마지막 ${ago(worker.last_seen, now)} — 맥이 켜져 있고 bin/install_schedule.command 가 등록됐는지 확인`
            : "맥 워커 기록 없음 — 0029 실행 후 맥에서 bin/install_schedule.command"}
        </div>
      </div>

      <details className="mt-3 rounded-md border border-border bg-surface p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">자동 실행 설정 {tc ? (tc.active ? "· 켜짐 (매주 월요일)" : "· 꺼짐") : ""}</summary>
        {!tc ? (
          <p className="mt-2 text-sm text-muted">이 고객사는 아직 트래커에 없습니다. 맥의 트래커 앱에서 등록하고 한 번 올리면 여기서 설정할 수 있습니다.</p>
        ) : (
          <div className="mt-2 space-y-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[#2563EB]" />
              매주 자동 측정 (월요일 09:00, 실패하면 13:00·18:00·화요일 09:00 재시도 — 맥이 켜져 있어야 합니다)
            </label>
            {tc.readiness.length > 0 && active && (
              <p className="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                자동 실행을 켜려면 먼저 채울 것: {tc.readiness.join(" / ")} (맥 트래커 앱 → 고객사 설정)
              </p>
            )}
            <div>
              <p className="mb-1 text-xs font-medium text-muted">{scope === "seo" ? "검색 순위 표면" : "AI 노출 표면"}</p>
              <div className="flex flex-wrap gap-2">
                {scopeSurfaces.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-sm">
                    <input type="checkbox" checked={on.has(s)} onChange={() => toggle(s)} className="accent-[#2563EB]" />
                    {surfaceLabel(s)}
                  </label>
                ))}
                {scope === "geo" &&
                  LLM_SURFACES.map((s) => (
                    <label key={s} className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-sm">
                      <input type="checkbox" checked={on.has(s)} onChange={() => toggle(s)} className="accent-[#2563EB]" />
                      {surfaceLabel(s)} (API)
                    </label>
                  ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={saveSettings}
                disabled={busy !== null}
                className="rounded-md border border-accent px-3 py-1.5 text-sm font-semibold text-accent-deep hover:bg-tint disabled:opacity-50"
              >
                {busy === "settings" ? "보내는 중…" : "설정 저장 (맥에 반영)"}
              </button>
              <span className="text-xs text-muted">질문·검색어·경쟁사는 아직 맥 트래커 앱에서 고칩니다.</span>
            </div>
          </div>
        )}
      </details>

      {msg && <p className="mt-2 text-xs text-accent-deep">{msg}</p>}

      {rows.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-muted">최근 요청</p>
          <ul className="space-y-1">
            {rows.map((r) => {
              const res = (r.result ?? {}) as Record<string, unknown>;
              const summary =
                r.status === "failed"
                  ? String(res.error ?? "실패")
                  : r.kind === "run" && r.status === "done"
                    ? `관측 ${res.observations ?? 0} · 노출 ${res.present ?? 0} · 오류 ${res.errors ?? 0}${res.rank_observations ? ` · 순위 ${res.rank_observations}` : ""}`
                    : r.kind === "settings" && r.status === "done"
                      ? `자동 실행 ${res.active ? "켜짐" : "꺼짐"} · 표면 ${((res.enabled_surfaces as string[]) ?? []).map(surfaceLabel).join(", ") || "없음"}`
                      : "";
              return (
                <li key={r.id} className="rounded-md bg-surface px-2.5 py-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_CLS[r.status] ?? ""}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    <span className="font-medium text-ink">{KIND_LABEL[r.kind] ?? r.kind}</span>
                    <span className="text-muted">{ago(r.created_at, now)} 요청</span>
                    {summary && <span className={r.status === "failed" ? "text-red-700" : "text-muted"}>{summary}</span>}
                    {r.log && (
                      <button onClick={() => setOpenLog(openLog === r.id ? null : r.id)} className="ml-auto text-accent-deep hover:underline">
                        {openLog === r.id ? "기록 닫기" : "기록"}
                      </button>
                    )}
                  </div>
                  {openLog === r.id && r.log && <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-subtle p-2 text-[11px] text-ink">{r.log}</pre>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
