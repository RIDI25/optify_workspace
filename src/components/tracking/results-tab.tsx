"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABELS, surfaceLabel } from "@/lib/tracker";
import type { TrackerObservation, TrackerRankObservation, TrackerRun } from "@/types/tracker";
import { DataTable, ExtLink, Notice, Section, Select } from "./ui";
import { useSignedUrl } from "./use-signed-url";

/** 결과 보기: 실행 → 질문 → 회차를 골라 답변 본문·판정·출처·캡처를 본다 */
export function ResultsTab({ runs, scope }: { runs: TrackerRun[]; scope: "geo" | "seo" }) {
  const [runId, setRunId] = useState(runs[0]?.run_id ?? "");
  const activeRun = runs.find((r) => r.run_id === runId) ?? runs[0];
  // 실행별로 불러온 결과. runId 가 다르면 아직 불러오는 중
  const [data, setData] = useState<{ runId: string; obs: TrackerObservation[]; rankObs: TrackerRankObservation[] }>({
    runId: "",
    obs: [],
    rankObs: [],
  });
  const [promptKey, setPromptKey] = useState("");
  const [rep, setRep] = useState<number>(1);
  const [rankKey, setRankKey] = useState("");
  const [showCond, setShowCond] = useState(false);

  useEffect(() => {
    if (!activeRun) return;
    let active = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("tracker_observations").select("*").eq("run_id", activeRun.run_id).order("collected_at"),
      supabase.from("tracker_rank_observations").select("*").eq("run_id", activeRun.run_id).order("collected_at"),
    ]).then(([o, r]) => {
      if (!active) return;
      setData({
        runId: activeRun.run_id,
        obs: (o.data ?? []) as TrackerObservation[],
        rankObs: (r.data ?? []) as TrackerRankObservation[],
      });
    });
    return () => {
      active = false;
    };
  }, [activeRun]);
  const loaded = Boolean(activeRun) && data.runId === activeRun?.run_id;
  const obs = useMemo(() => (loaded ? data.obs : []), [loaded, data.obs]);
  const rankObs = useMemo(() => (loaded ? data.rankObs : []), [loaded, data.rankObs]);
  const loading = Boolean(activeRun) && !loaded;

  const prompts = useMemo(() => {
    const seen = new Map<string, { key: string; label: string }>();
    for (const o of obs) {
      const key = `${o.prompt_id}|${o.surface}`;
      if (!seen.has(key)) {
        seen.set(key, { key, label: `${o.prompt_id} [${o.intent ?? ""}] ${o.prompt_text ?? ""} · ${surfaceLabel(o.surface)}` });
      }
    }
    return Array.from(seen.values());
  }, [obs]);
  const activePromptKey = prompts.some((p) => p.key === promptKey) ? promptKey : (prompts[0]?.key ?? "");
  const reps = useMemo(() => {
    const [pid, surface] = activePromptKey.split("|");
    return obs.filter((o) => o.prompt_id === pid && o.surface === surface).sort((a, b) => a.rep - b.rep);
  }, [obs, activePromptKey]);
  const current = reps.find((o) => o.rep === rep) ?? reps[0];

  const rankOptions = rankObs.map((o) => ({
    value: o.obs_id,
    label: `${o.keyword_id} ${o.keyword_text ?? ""} · ${surfaceLabel(o.surface)} · ${o.best_position ? `${o.best_position}위` : o.error ? "오류" : "없음"}`,
  }));
  const activeRank = rankObs.find((o) => o.obs_id === rankKey) ?? rankObs[0];

  if (runs.length === 0) return <Notice kind="info">아직 실행 기록이 없습니다.</Notice>;

  return (
    <div className="space-y-4">
      <Section>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_3fr_1fr]">
          <Select
            label="실행"
            value={activeRun?.run_id ?? ""}
            onChange={setRunId}
            options={runs.map((r) => ({
              value: r.run_id,
              label: `${r.run_id} · ${STATUS_LABELS[r.status] ?? r.status} · 노출 ${r.present}/${r.observations}`,
            }))}
          />
          {scope === "geo" ? (
            <>
              <Select label="질문" value={activePromptKey} onChange={setPromptKey} options={prompts.map((p) => ({ value: p.key, label: p.label }))} />
              <Select
                label="회차"
                value={String(current?.rep ?? 1)}
                onChange={(v) => setRep(Number(v))}
                options={reps.map((o) => ({ value: String(o.rep), label: `${o.rep}회` }))}
              />
            </>
          ) : (
            <div className="md:col-span-2">
              {activeRank && <Select label="검색어 · 표면" value={activeRank.obs_id} onChange={setRankKey} options={rankOptions} />}
            </div>
          )}
        </div>
      </Section>

      {loading && <p className="text-sm text-muted">불러오는 중…</p>}

      {scope === "seo" && !loading && rankObs.length === 0 && (
        <Notice kind="info">이 실행에는 검색 순위 관측이 없습니다. 검색 순위 표면이 켜진 실행을 고르세요.</Notice>
      )}
      {scope === "seo" && activeRank && (
        <Section title={`검색 순위 결과 (${rankObs.length}건)`}>
          <RankDetail obs={activeRank} />
        </Section>
      )}

      {scope === "geo" && !loading && obs.length === 0 && (
        <Notice kind="info">이 실행에는 AI 관측이 없습니다. AI 표면이 켜진 실행을 고르세요.</Notice>
      )}

      {scope === "geo" && current && (
        <>
          {current.error && <Notice kind="error">수집 오류: {current.error}</Notice>}
          {!current.present && !current.error && <Notice kind="warn">이 질문에는 AI 답변 블록이 뜨지 않았습니다.</Notice>}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
            <div className="space-y-4">
              <Section title="판정">
                <DataTable
                  header={["대상", "구분", "본문 언급", "매칭 표기", "언급 순서", "출처 인용", "인용 순위"]}
                  empty="판정 기록이 없습니다. 실행 후 판정이 아직 안 돌았을 수 있습니다."
                  dense
                  rows={current.mentions.map((m) => [
                    m.entity,
                    m.entity_type === "brand" ? "우리" : "경쟁사",
                    m.in_answer ? "예" : "아니오",
                    m.matched_alias ?? "",
                    m.mention_order ?? "",
                    m.in_citation ? "예" : "아니오",
                    (m.citation_ranks ?? []).join(", "),
                  ])}
                />
              </Section>
              <Section title={`답변 본문 (${current.answer_length}자)`}>
                {current.answer_text ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{current.answer_text}</div>
                ) : (
                  <p className="text-sm text-muted">본문 없음</p>
                )}
              </Section>
              <Section title="출처">
                <DataTable
                  header={["순위", "유형", "발행자", "제목", "도메인", "본문 인용", "URL"]}
                  empty="출처 없음"
                  dense
                  rows={current.citations.map((c) => [
                    c.rank ?? "",
                    c.source_type ?? "",
                    c.publisher ?? "",
                    c.title ?? "",
                    c.domain ?? "",
                    c.inline_count ?? "",
                    <ExtLink key="u" href={c.url}>
                      열기
                    </ExtLink>,
                  ])}
                />
              </Section>
              {current.entities.length > 0 && (
                <Section title="본문·출처에 나온 업체명">
                  <DataTable
                    header={["이름", "출처", "등록된 이름"]}
                    dense
                    rows={current.entities.map((e) => [e.name_raw, e.source === "answer" ? "본문" : "발행자", e.matched_to ?? "(미등록)"])}
                  />
                </Section>
              )}
            </div>
            <div className="space-y-4">
              <Section title="캡처">
                <Screenshot path={current.screenshot_path} />
              </Section>
              <Section
                title="이 관측의 조건"
                right={
                  <button onClick={() => setShowCond((v) => !v)} className="text-xs text-accent-deep hover:underline">
                    {showCond ? "접기" : "펼치기"}
                  </button>
                }
              >
                {showCond && (
                  <pre className="overflow-x-auto rounded-md bg-subtle p-3 text-xs text-ink">{JSON.stringify(current.conditions, null, 2)}</pre>
                )}
                <p className="mt-2 text-xs text-muted">
                  수집 시각 {current.collected_at ?? "-"} · {current.obs_id}
                </p>
              </Section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Screenshot({ path, width }: { path: string | null; width?: number }) {
  const url = useSignedUrl(path);
  if (!path) return <p className="text-sm text-muted">캡처 없음</p>;
  if (!url) return <p className="text-sm text-muted">캡처 불러오는 중…</p>;
  // 서명 URL 은 호스트가 매번 달라 next/image 대신 img 를 쓴다
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="캡처" style={width ? { width } : undefined} className="max-w-full rounded-md border border-border" />;
}

function RankDetail({ obs }: { obs: TrackerRankObservation }) {
  return (
    <div className="space-y-3">
      <DataTable
        header={["순서", "영역", "영역 내", "우리", "제목", "도메인", "URL"]}
        empty="결과 항목이 없습니다."
        dense
        rows={obs.items.map((it) => [
          it.position ?? "",
          it.section ?? "",
          it.section_rank ?? "",
          it.owned ? "★" : "",
          it.title ?? "",
          it.domain ?? "",
          <ExtLink key="u" href={it.url}>
            열기
          </ExtLink>,
        ])}
      />
      <Screenshot path={obs.screenshot_path} width={390} />
    </div>
  );
}
