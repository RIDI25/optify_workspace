import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPeecSummary, findProject, type PeecSummary } from "@/lib/peec";

/** GEO 탭·추론·PDF 공용 — 고객사의 최근 N일 Peec 요약. 같은 고객사·기간은 10분 캐시(Peec 한도 200회/분). */
const cache = new Map<string, { at: number; data: PeecSummary }>();

export function peecPeriod(days: number): { start: string; end: string } {
  const kst = new Date(Date.now() + 9 * 3_600_000);
  return {
    end: kst.toISOString().slice(0, 10),
    start: new Date(kst.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10),
  };
}

/** 추론 저장 키 (tracker_insights.run_id) */
export const peecRunId = (p: { start: string; end: string }) => `peec:${p.start}~${p.end}`;

export async function loadPeecSummary(
  supabase: SupabaseClient,
  clientId: string,
  days: number,
  refresh = false,
): Promise<{ ok: true; summary: PeecSummary; client: { id: string; name: string }; cached?: boolean } | { ok: false; error: string; status: number; notLinked?: boolean }> {
  const key = process.env.PEEC_API_KEY;
  if (!key) return { ok: false, error: "PEEC_API_KEY 가 설정되지 않았습니다 (Vercel 환경 변수)", status: 500 };
  const { data: client } = await supabase.from("clients").select("id, name, website_url").eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, error: "고객사를 찾을 수 없습니다", status: 404 };
  const period = peecPeriod(days);
  const ck = `${clientId}|${period.start}|${period.end}`;
  const hit = cache.get(ck);
  if (hit && !refresh && Date.now() - hit.at < 10 * 60_000) return { ok: true, summary: hit.data, client, cached: true };
  try {
    const project = await findProject(key, client as { name: string; website_url?: string | null });
    if (!project) {
      return { ok: false, notLinked: true, status: 200, error: `Peec 에 '${client.name}' 프로젝트가 없습니다. Peec 에서 프로젝트를 만들고 우리 브랜드 도메인을 홈페이지 주소와 같게 넣으면 자동으로 연결됩니다.` };
    }
    const summary = await fetchPeecSummary(key, project, period.start, period.end);
    cache.set(ck, { at: Date.now(), data: summary });
    return { ok: true, summary, client };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Peec 조회 실패", status: 502 };
  }
}

export const clampDays = (v: unknown) => Math.min(90, Math.max(1, Number(v ?? 7) || 7));
