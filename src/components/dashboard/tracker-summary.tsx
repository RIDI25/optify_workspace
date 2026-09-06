import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, shortTime } from "@/lib/tracker";
import type { TrackerClient, TrackerRun } from "@/types/tracker";

type RunLite = Pick<TrackerRun, "run_id" | "client_id" | "week" | "started_at" | "status" | "observations" | "present" | "errors">;

/**
 * 대시보드 위젯: 모든 고객사의 최근 트래커 실행과 경고 (트래커 콘솔 '홈 · 전체 현황').
 * 트래커 테이블이 아직 없거나 비어 있으면 아무것도 그리지 않는다.
 */
export async function TrackerSummary() {
  const supabase = await createClient();
  const [{ data: tcs }, { data: runs }] = await Promise.all([
    supabase.from("tracker_clients").select("*").order("name"),
    supabase
      .from("tracker_runs")
      .select("run_id, client_id, week, started_at, status, observations, present, errors")
      .order("started_at", { ascending: false })
      .limit(300),
  ]);
  const clients = (tcs ?? []) as TrackerClient[];
  if (clients.length === 0) return null;

  const latestByClient = new Map<string, RunLite>();
  for (const r of (runs ?? []) as RunLite[]) {
    if (!latestByClient.has(r.client_id)) latestByClient.set(r.client_id, r);
  }
  const warnings: string[] = [];
  for (const c of clients) {
    const latest = latestByClient.get(c.client_id);
    if (latest && latest.observations > 0 && latest.present === 0) {
      warnings.push(`${c.name}: 최근 실행에서 노출이 0건입니다. 네이버·구글 화면 구조가 바뀌었는지 확인하세요.`);
    }
    if (latest && latest.errors > 0) warnings.push(`${c.name}: 최근 실행에 오류 ${latest.errors}건.`);
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">AI 노출 · 검색 순위 (트래커)</h2>
        <Link href="/clients" className="text-xs text-accent-deep hover:underline">
          고객사 →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              {["고객사", "자동 실행", "최근 실행", "상태", "AI 관측", "노출", "오류", "준비 부족"].map((h) => (
                <th key={h} className="px-2 py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const latest = latestByClient.get(c.client_id);
              return (
                <tr key={c.client_id} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-1 font-medium text-ink">
                    <Link href={`/clients/${c.client_id}/geo`} className="hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-2 py-1">{c.active ? "켜짐" : "대기"}</td>
                  <td className="px-2 py-1">{latest ? shortTime(latest.started_at) : "-"}</td>
                  <td className="px-2 py-1">{latest ? (STATUS_LABELS[latest.status] ?? latest.status) : "-"}</td>
                  <td className="px-2 py-1">{latest?.observations ?? 0}</td>
                  <td className="px-2 py-1">{latest?.present ?? 0}</td>
                  <td className="px-2 py-1">{latest?.errors ?? 0}</td>
                  <td className="px-2 py-1">{c.readiness.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {warnings.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {warnings.map((w) => (
            <li key={w} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
              {w}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted">경고 없음</p>
      )}
    </section>
  );
}
