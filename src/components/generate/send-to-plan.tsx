"use client";

import { useState } from "react";
import Link from "next/link";
import { sendToPlan } from "@/lib/actions/contents";

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
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"idea" | "writing">("idea");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // 이미 플랜에서 진입한 생성물이면 되돌아가기만 제공
  if (planId) {
    return (
      <Link
        href="/plans"
        className="block rounded-md border border-border px-3 py-2 text-center text-sm hover:bg-subtle"
      >
        플랜으로 돌아가기
      </Link>
    );
  }

  if (done) {
    return (
      <div className="rounded-md bg-tint px-3 py-2 text-center text-sm text-accent-deep">
        플랜에 추가됨 ·{" "}
        <Link href="/plans" className="underline">
          플랜에서 보기
        </Link>
      </div>
    );
  }

  async function save() {
    setBusy(true);
    const res = await sendToPlan({
      clientId,
      channel,
      title,
      contentId,
      scheduledDate: date || null,
      status,
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      setOpen(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-md border border-accent-deep px-3 py-2 text-sm font-medium text-accent-deep hover:bg-tint"
      >
        콘텐츠 플랜으로 보내기
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-5 shadow-lg">
            <h3 className="text-base font-bold text-ink">콘텐츠 플랜으로 보내기</h3>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">
                예정일 (선택)
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
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "idea" | "writing")
                }
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="idea">아이디어</option>
                <option value="writing">작성 중</option>
              </select>
            </div>

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
    </>
  );
}
