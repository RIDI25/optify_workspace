"use client";

import { useState } from "react";
import { STATUS_LABELS, shortTime, surfaceLabel } from "@/lib/tracker";
import type { TrackerClient, TrackerRun } from "@/types/tracker";
import { Chip, DataTable, Notice, Section, StatCard } from "./ui";

/** 개요: 준비 상태 · 설정 요약 · 실행 이력 · 최근 측정 조건 (트래커 콘솔 '개요' 와 같은 내용) */
export function OverviewTab({ tc, runs }: { tc: TrackerClient; runs: TrackerRun[] }) {
  const [showCond, setShowCond] = useState(false);
  const latest = runs[0];

  return (
    <div className="space-y-4">
      {tc.readiness.length > 0 ? (
        <Notice kind="info">
          <p className="font-medium">자동 실행에 들어가기 전에 채울 것</p>
          <ul className="mt-1 list-disc pl-5">
            {tc.readiness.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">맥의 옵티파이 트래커 앱 → 고객사 설정에서 채웁니다.</p>
        </Notice>
      ) : (
        <Notice kind="success">
          준비 완료.{" "}
          {tc.active
            ? "매주 자동 실행 중입니다 (월요일 오전, 실패하면 오후·화요일에 다시 시도)."
            : "트래커 앱의 고객사 설정에서 '자동 실행'을 켜면 다음 주부터 돕니다."}
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="활성 질문" value={tc.prompts_active} caption="AI 에게 매주 던지는 질문" />
        <StatCard label="검색어" value={tc.keywords_active} caption="검색 순위를 재는 키워드" />
        <StatCard label="경쟁사" value={tc.competitors.length} caption={tc.competitors.slice(0, 3).join(", ") || "미등록"} />
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted">켜진 표면</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {tc.enabled_surfaces.length === 0 ? (
              <span className="text-sm text-muted">없음</span>
            ) : (
              tc.enabled_surfaces.map((s) => (
                <Chip key={s} active>
                  {surfaceLabel(s)}
                </Chip>
              ))
            )}
          </div>
        </div>
      </div>

      <Section
        title="실행 이력"
        right={
          <span className="text-xs text-muted">
            마지막 동기화 {shortTime(tc.synced_at)} · 지금 실행은 맥의 트래커 앱에서
          </span>
        }
      >
        <DataTable
          header={["실행", "주", "시각", "상태", "AI 관측", "노출", "오류", "표면", "단절"]}
          empty="아직 실행 기록이 없습니다."
          rows={runs.map((r) => [
            <span key="id" className="font-mono text-xs">
              {r.run_id}
            </span>,
            r.week,
            shortTime(r.started_at),
            <span
              key="st"
              className={
                r.status === "done"
                  ? "text-blue-700"
                  : r.status === "failed"
                    ? "text-red-600"
                    : "text-muted"
              }
            >
              {STATUS_LABELS[r.status] ?? r.status}
            </span>,
            r.observations,
            r.present,
            r.errors,
            r.surfaces.map(surfaceLabel).join(", "),
            r.break_flag ?? "",
          ])}
        />
      </Section>

      {latest && (
        <Section
          title="최근 실행 조건"
          right={
            <button
              onClick={() => setShowCond((v) => !v)}
              className="text-xs text-accent-deep hover:underline"
            >
              {showCond ? "접기" : "펼치기"}
            </button>
          }
        >
          {showCond ? (
            <pre className="overflow-x-auto rounded-md bg-subtle p-3 text-xs text-ink">
              {JSON.stringify(latest.conditions, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-muted">
              {String(latest.conditions.device ?? "-")} · {String(latest.conditions.login ?? "-")} · IP{" "}
              {String(latest.conditions.public_ip ?? "-")} ({String(latest.conditions.ip_region ?? "-")})
            </p>
          )}
        </Section>
      )}
    </div>
  );
}
