import type { SupabaseClient } from "@supabase/supabase-js";
import { buildGeoDigest, buildSeoDigest, compareDigests, type RunDigest } from "@/lib/tracker-digest";
import type { TrackerClient, TrackerObservation, TrackerRankObservation, TrackerRun, TrackerWeeklyMetric } from "@/types/tracker";
import type { TrackingScope } from "@/components/tracking/tracking-view";

import { RANK_SURFACES, runHasScope } from "@/lib/tracker";

export interface RunBundle {
  client: { id: string; name: string };
  tc: TrackerClient | null;
  scope: TrackingScope;
  run: TrackerRun;
  prevRun: TrackerRun | null;
  digest: RunDigest;
  prevDigest: RunDigest | null;
  changes: string[];
  weekly: TrackerWeeklyMetric[];
}

async function loadDigest(supabase: SupabaseClient, scope: TrackingScope, runId: string): Promise<RunDigest> {
  if (scope === "seo") {
    const { data } = await supabase.from("tracker_rank_observations").select("*").eq("run_id", runId).order("collected_at").limit(2000);
    return buildSeoDigest((data ?? []) as TrackerRankObservation[]);
  }
  const { data } = await supabase.from("tracker_observations").select("*").eq("run_id", runId).order("collected_at").limit(2000);
  return buildGeoDigest((data ?? []) as TrackerObservation[]);
}

/** 측정 하나 + 직전 측정 + 최근 12주 지표를 한 묶음으로 (추론·PDF 공용) */
export async function loadRunBundle(supabase: SupabaseClient, clientId: string, scope: TrackingScope, runId?: string | null): Promise<RunBundle | { error: string }> {
  const [{ data: client }, { data: tc }, { data: runsData }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).maybeSingle(),
    supabase.from("tracker_clients").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("tracker_runs").select("*").eq("client_id", clientId).order("started_at", { ascending: false }).limit(100),
  ]);
  if (!client) return { error: "고객사를 찾을 수 없습니다." };
  const runs = ((runsData ?? []) as TrackerRun[]).filter((r) => runHasScope(r, scope));
  if (runs.length === 0) return { error: "이 관점의 측정 기록이 아직 없습니다." };
  const idx = runId ? runs.findIndex((r) => r.run_id === runId) : 0;
  if (idx < 0) return { error: "측정 기록을 찾을 수 없습니다." };
  const run = runs[idx];
  const prevRun = runs[idx + 1] ?? null;
  const [digest, prevDigest, weeklyRes] = await Promise.all([
    loadDigest(supabase, scope, run.run_id),
    prevRun ? loadDigest(supabase, scope, prevRun.run_id) : Promise.resolve(null),
    supabase
      .from("tracker_weekly_metrics")
      .select("*")
      .eq("client_id", clientId)
      .eq("intent", "all")
      .in("metric", scope === "seo" ? ["rank_found_rate", "rank_top10_rate", "rank_avg_best_position"] : ["exposure_rate", "mention_rate", "citation_rate", "sov_mention"])
      .order("week", { ascending: false })
      .limit(400),
  ]);
  const weekly = ((weeklyRes.data ?? []) as TrackerWeeklyMetric[]).filter((w) => (scope === "seo" ? RANK_SURFACES.has(w.surface) : !RANK_SURFACES.has(w.surface)));
  const weeks = Array.from(new Set(weekly.map((w) => w.week))).sort().slice(-12);
  return {
    client: { id: client.id, name: client.name },
    tc: (tc ?? null) as TrackerClient | null,
    scope,
    run,
    prevRun,
    digest,
    prevDigest,
    changes: compareDigests(digest, prevDigest),
    weekly: weekly.filter((w) => weeks.includes(w.week)).sort((a, b) => a.week.localeCompare(b.week)),
  };
}
