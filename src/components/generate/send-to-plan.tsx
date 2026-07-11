"use client";

import { useState } from "react";
import Link from "next/link";
import { completeContent } from "@/lib/actions/contents";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 생성 완료 처리 푸터.
 * "생성 완료로 표시" → 날짜 지정 + 발행 완료/대기중 선택 → 플랜에 반영(생성 또는 갱신).
 * 플랜에서 진입한 생성물(planId 존재)은 그 플랜을 갱신한다.
 */
export function SendToPlanFooter({
  clientId,
  channel,
  title,
  contentId,
  planId,
}: {
  clientId: string;
  channel: string;
  title: string;
  contentId: string | null;
  planId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "published" | "pending">("");
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await completeContent({
        clientId,
        channel,
        title,
        contentId,
        planId,
        scheduledDate: date || null,
        publish,
      });
      if (res.ok) {
        setDone(publish ? "published" : "pending");
        setOpen(false);
      } else {
        setError(res.error ?? "저장에 실패했습니다.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {done ? (
        <div className="rounded-md bg-tint px-3 py-2 text-center text-sm text-accent-deep">
          {done === "published" ? "✓ 발행 완료로 기록됨" : "✓ 대기중으로 플랜에 반영됨"}{" "}
          ·{" "}
          <Link href="/plans" className="underline">
            플랜에서 보기
          </Link>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-md border border-accent-deep px-3 py-2 text-sm font-medium text-accent-deep hover:bg-tint"
        >
          생성 완료로 표시
        </button>
      )}

      {planId && (
        <Link
          href="/plans"
          className="block rounded-md border border-border px-3 py-2 text-center text-sm hover:bg-subtle"
        >
          플랜으로 돌아가기
        </Link>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-5 shadow-lg">
            <h3 className="text-base font-bold text-ink">생성 완료로 표시</h3>
            <p className="text-xs text-muted">
              날짜와 상태를 지정하면 콘텐츠 플랜과 캘린더에 반영됩니다.
            </p>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">
                발행(예정)일
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">상태</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPublish(true)}
                  className={[
                    "flex-1 rounded-md border px-3 py-2 text-sm font-medium",
                    publish
                      ? "border-accent-deep bg-tint text-accent-deep"
                      : "border-border text-muted hover:bg-subtle",
                  ].join(" ")}
                >
                  발행 완료
                </button>
                <button
                  onClick={() => setPublish(false)}
                  className={[
                    "flex-1 rounded-md border px-3 py-2 text-sm font-medium",
                    !publish
                      ? "border-accent-deep bg-tint text-accent-deep"
                      : "border-border text-muted hover:bg-subtle",
                  ].join(" ")}
                >
                  대기중
                </button>
              </div>
              <p className="text-xs text-muted">
                {publish
                  ? "이미 발행한 글 — 발행 집계에 포함됩니다."
                  : "발행 예정 — 캘린더에 예정 콘텐츠로 표시됩니다."}
              </p>
            </div>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-subtle"
              >
                취소
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
