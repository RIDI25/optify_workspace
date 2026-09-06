"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import type { TrackerClient, TrackerRun } from "@/types/tracker";
import { OverviewTab } from "./overview-tab";
import { TrendTab } from "./trend-tab";
import { ResultsTab } from "./results-tab";
import { Notice } from "./ui";

type Tab = "overview" | "trend" | "results";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "개요" },
  { key: "trend", label: "추세" },
  { key: "results", label: "결과 보기" },
];

/**
 * AI 노출·검색 순위 (옵티파이 트래커 결과). 트래커 콘솔의 개요·추세·결과 보기를 한 화면의 탭으로.
 * 데이터는 맥의 트래커가 Supabase 로 올린 것(읽기 전용). 실행·설정은 아직 맥 앱에서.
 */
export function TrackingView() {
  const { selectedClientId, selectedClient, loading: clientsLoading } = useClientContext();
  const [tab, setTab] = useState<Tab>("overview");
  // 고객사별로 불러온 상태. clientId 가 다르면 아직 불러오는 중
  const [data, setData] = useState<{ clientId: string; tc: TrackerClient | null; runs: TrackerRun[]; tableMissing: boolean }>({
    clientId: "",
    tc: null,
    runs: [],
    tableMissing: false,
  });

  useEffect(() => {
    if (!selectedClientId) return;
    let active = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("tracker_clients").select("*").eq("client_id", selectedClientId).maybeSingle(),
      supabase
        .from("tracker_runs")
        .select("*")
        .eq("client_id", selectedClientId)
        .order("started_at", { ascending: false }),
    ]).then(([tcRes, runsRes]) => {
      if (!active) return;
      setData({
        clientId: selectedClientId,
        tc: (tcRes.data ?? null) as TrackerClient | null,
        runs: (runsRes.data ?? []) as TrackerRun[],
        tableMissing: Boolean(tcRes.error),
      });
    });
    return () => {
      active = false;
    };
  }, [selectedClientId]);
  const loading = data.clientId !== selectedClientId;
  const { tc, runs, tableMissing } = data;

  if (clientsLoading) return null;
  if (!selectedClientId) {
    return <p className="text-sm text-muted">상단에서 클라이언트를 선택하세요.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-accent">고객사 · {selectedClient?.name}</p>
        <h1 className="text-xl font-bold text-ink">AI 노출 · 검색 순위</h1>
        <p className="mt-1 text-sm text-muted">
          옵티파이 트래커가 매주 잰 결과. 네이버·구글 AI 답변과 AI 4종(ChatGPT·Gemini·Perplexity·Claude)의 언급·인용, 네이버·구글 검색 순위.
        </p>
      </div>

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
      ) : tab === "overview" ? (
        <OverviewTab key={tc.client_id} tc={tc} runs={runs} />
      ) : tab === "trend" ? (
        <TrendTab key={tc.client_id} clientId={tc.client_id} clientName={tc.name} />
      ) : (
        <ResultsTab key={tc.client_id} runs={runs} />
      )}
    </div>
  );
}
