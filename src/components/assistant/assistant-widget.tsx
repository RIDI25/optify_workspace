"use client";

import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: { name: string; ok: boolean; summary: string }[];
}

const GREETING =
  "무엇을 도와드릴까요? 예)\n· 오늘 OO기획에 550만원 세금계산서 발행했어, 등록해줘\n· OO기획에서 선금 300만원 입금됐어\n· 동생한테 OO치과 블로그 발행 시켜놔, 금요일까지\n· 수요일 2시 OO기획 미팅 잡아줘\n· 다음 주 일정 뭐 있어?";

/** 워크스페이스 비서 — 우하단 플로팅 챗. 자연어로 매출·입금·리드 등록 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const d = await res.json();
      setMessages((prev) => [
        ...prev,
        d.ok
          ? { role: "assistant", content: d.text, actions: d.actions }
          : { role: "assistant", content: `오류: ${d.error ?? "처리 실패"}`, actions: d.actions },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: e instanceof Error ? e.message : "네트워크 오류" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="워크스페이스 비서"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent-deep text-xl text-white shadow-lg transition-transform hover:scale-105"
      >
        {open ? "✕" : "🤖"}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-40 flex h-[min(560px,75vh)] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-tint/50 px-4 py-2.5">
            <p className="text-sm font-bold text-ink">
              워크스페이스 비서
              <span className="ml-1.5 text-[10px] font-normal text-muted">매출·입금·리드 등록</span>
            </p>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-xs text-muted hover:text-ink"
              >
                초기화
              </button>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <p className="whitespace-pre-wrap rounded-lg bg-subtle p-3 text-xs leading-relaxed text-muted">
                {GREETING}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={[
                    "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed",
                    m.role === "user" ? "bg-accent-deep text-white" : "bg-subtle text-ink",
                  ].join(" ")}
                >
                  {m.content}
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                      {m.actions.map((a, j) => (
                        <p key={j} className="text-[11px] text-muted">
                          {a.ok ? "✅" : "⚠️"} {a.summary}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-subtle px-3 py-2 text-sm text-muted">
                  처리 중<span className="animate-pulse">…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex items-end gap-2 border-t border-border p-2.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="요청을 입력하세요… (Enter 전송)"
              className="flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="rounded-md bg-accent px-3 py-2 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
            >
              전송
            </button>
          </div>
        </div>
      )}
    </>
  );
}
