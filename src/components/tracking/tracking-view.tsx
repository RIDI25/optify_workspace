"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/tracker";
import { useClientContext } from "@/components/providers/client-context";
import type { TrackerClient, TrackerRun } from "@/types/tracker";
import { OverviewTab } from "./overview-tab";
import { TrendTab } from "./trend-tab";
import { ResultsTab } from "./results-tab";
import { Notice } from "./ui";
import { TrackerControls } from "./tracker-controls";
import { RecordsTab } from "./records-tab";

type Tab = "records" | "overview" | "trend" | "results";
export type TrackingScope = "geo" | "seo";
const SCOPES: { key: TrackingScope; tag: string; title: string; desc: string }[] = [
  { key: "geo", tag: "GEO", title: "AI 노출", desc: "네이버·구글 AI 답변과 AI 4종(ChatGPT·Gemini·Perplexity·Claude)이 우리를 언급·인용하는지. 옵티파이 트래커가 매주 잽니다." },
  { key: "seo", tag: "SEO", title: "검색 순위", desc: "네이버·구글 검색 결과에서 우리 홈페이지·블로그·플레이스가 몇 번째에 있는지. 옵티파이 트래커가 매주 잽니다." },
];
const TABS: { key: Tab; label: string }[] = [
  { key: "records", label: "측정 기록" },
  { key: "overview", label: "개요" },
  { key: "trend", label: "추세" },
  { key: "results", label: "결과 보기" },
];

/**
 * AI 노출·검색 순위 (옵티파이 트래커 결과). 트래커 콘솔의 개요·추세·결과 보기를 한 화면의 탭으로.
 * 데이터는 맥의 트래커가 Supabase 로 올린 것(읽기 전용). 실행·설정은 아직 맥 앱에서.
 */
export function TrackingView({ scope: fixedScope }: { scope?: TrackingScope } = {}) {
  const { selectedClientId, selectedClient, loading: clientsLoading } = useClientContext();
  const params = useSearchParams();
  const scope: TrackingScope = fixedScope ?? (params.get("view") === "seo" ? "seo" : "geo");
  const scopeDef = SCOPES.find((s) => s.key === scope) ?? SCOPES[0];
  const [tab, setTab] = useState<Tab>("records");
  const [tick, setTick] = useState(0); // 맥 워커가 요청을 끝내면 +1 → 다시 읽기
  // 고객사별로 불러온 상태. clientId 가 다르면 아직 불러오는 중
  const [data, setData] = useState<{
    clientId: string;
    tc: TrackerClient | null;
    runs: TrackerRun[];
    tableMissing: boolean;
    runsError: string | null;
  }>({
    clientId: "",
    tc: null,
    runs: [],
    tableMissing: false,
    runsError: null,
  });

  useEffect(() => {
    if (!selectedClientId) return;
    let active = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("tracker_clients").select("*").eq("client_id", selectedClientId).maybeSingle(),
      fetchAllRows<TrackerRun>((from, to) =>
        supabase
          .from("tracker_runs")
          .select("*")
          .eq("client_id", selectedClientId)
          .order("started_at", { ascending: false })
          .order("run_id", { ascending: false })
          .range(from, to),
      ),
    ]).then(([tcRes, runsRes]) => {
      if (!active) return;
      setData({
        clientId: selectedClientId,
        tc: (tcRes.data ?? null) as TrackerClient | null,
        runs: runsRes.rows,
        tableMissing: Boolean(tcRes.error),
        runsError: runsRes.error,
      });
    });
    return () => {
      active = false;
    };
  }, [selectedClientId, tick]);
  const loading = data.clientId !== selectedClientId;
  const { tc, runs, tableMissing, runsError } = data;

  if (clientsLoading) return null;
  if (!selectedClientId) {
    return <p className="text-sm text-muted">왼쪽 메뉴에서 고객사를 선택하세요.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-accent">고객사 · {selectedClient?.name}</p>
          <h1 className="text-xl font-bold text-ink">
            <span className="mr-2 rounded-md bg-tint px-2 py-0.5 text-sm font-bold text-accent-deep">{scopeDef.tag}</span>
            {scopeDef.title}
          </h1>
          <p className="mt-1 text-sm text-muted">{scopeDef.desc}</p>
        </div>
        {!fixedScope && (
        <div className="flex gap-1 rounded-full border border-border bg-surface p-0.5">
          {SCOPES.map((s) => (
            <Link
              key={s.key}
              href={`/tracking?view=${s.key}`}
              className={[
                "rounded-full px-3 py-1 text-xs font-semibold",
                s.key === scope ? "bg-accent-deep text-white" : "text-muted hover:text-ink",
              ].join(" ")}
            >
              {s.tag} · {s.title}
            </Link>
          ))}
        </div>
        )}
      </div>

      {!loading && !tableMissing && (
        <TrackerControls key={`${selectedClientId}-${scope}-${tc?.synced_at ?? ""}`} clientId={selectedClientId} scope={scope} tc={tc} onJobDone={() => setTick((n) => n + 1)} />
      )}

      <div className="flex gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key ? "border-accent text-accent-deep" : "border-transparent text-muted hover:text-ink",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!loading && !tableMissing && tc && runsError && (
        <Notice kind="error">실행 이력을 불러오지 못했습니다: {runsError}</Notice>
      )}

      {loading ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : tableMissing ? (
        <Notice kind="warn">
          트래커 테이블이 아직 없습니다. supabase/migrations/0025_tracker.sql 을 Supabase SQL Editor 에서 실행한 뒤 다시 여세요.
        </Notice>
      ) : !tc ? (
        <Notice kind="info">
          이 고객사는 아직 트래커에 연결되지 않았습니다. 맥의 옵티파이 트래커 앱에서 고객사를 등록하고 한 번 실행(또는 설정 → 워크스페이스로 올리기)하면
          여기에 나타납니다.
        </Notice>
      ) : tab === "records" ? (
        <RecordsTab key={`${tc.client_id}-${scope}`} clientId={tc.client_id} scope={scope} runs={runs} />
      ) : tab === "overview" ? (
        <OverviewTab key={tc.client_id} tc={tc} runs={runs} />
      ) : tab === "trend" ? (
        <TrendTab key={`${tc.client_id}-${scope}`} clientId={tc.client_id} clientName={tc.name} scope={scope} />
      ) : (
        <ResultsTab key={`${tc.client_id}-${scope}`} runs={runs} scope={scope} />
      )}
    </div>
  );
}
