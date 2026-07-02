"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { getChannel, THREADS_CONTENT_TYPES } from "@/lib/channels";
import { stripMarkdown } from "@/lib/text";
import {
  META_DELIMITER,
  type StreamMeta,
} from "@/lib/generation/stream-protocol";
import type { ChannelSettings } from "@/types/database";

export function GenerateView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");

  const [channels, setChannels] = useState<ChannelSettings[]>([]);
  const [channel, setChannel] = useState<string>("");
  const [contentType, setContentType] = useState<string>("auto");
  const [topic, setTopic] = useState("");
  const [extra, setExtra] = useState("");

  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">(
    "idle",
  );
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [copied, setCopied] = useState(false);

  // 프리필: 플랜에서 진입 시 채널/주제 세팅
  useEffect(() => {
    const planChannel = searchParams.get("channel");
    const planTitle = searchParams.get("title");
    if (planChannel) setChannel(planChannel);
    if (planTitle) setTopic(planTitle);
  }, [searchParams]);

  // 선택 클라이언트의 활성 채널 로드
  useEffect(() => {
    if (!selectedClientId) return;
    const supabase = createClient();
    supabase
      .from("channel_settings")
      .select("*")
      .eq("client_id", selectedClientId)
      .eq("is_active", true)
      .then(({ data }) => {
        const rows = (data ?? []) as ChannelSettings[];
        setChannels(rows);
        setChannel((prev) => prev || rows[0]?.channel || "");
      });
  }, [selectedClientId]);

  const activeChannelDef = useMemo(() => getChannel(channel), [channel]);
  const hasContentTypes = activeChannelDef?.hasContentTypes ?? false;

  async function generate() {
    if (!selectedClientId || !channel || !topic.trim()) return;
    setStatus("streaming");
    setBody("");
    setMeta(null);
    setCopied(false);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          channel,
          contentType: hasContentTypes ? contentType : null,
          topic,
          extraInstructions: extra,
          planId: planId ?? null,
        }),
      });

      if (!res.ok || !res.body) {
        setStatus("error");
        setBody(await res.text());
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const idx = buffer.indexOf(META_DELIMITER);
        if (idx === -1) {
          setBody(buffer);
        } else {
          setBody(buffer.slice(0, idx));
        }
      }

      const idx = buffer.indexOf(META_DELIMITER);
      if (idx !== -1) {
        const bodyText = buffer.slice(0, idx);
        const metaJson = buffer.slice(idx + META_DELIMITER.length);
        setBody(bodyText);
        try {
          const m = JSON.parse(metaJson) as StreamMeta;
          setMeta(m);
          setStatus(m.error ? "error" : "done");
        } catch {
          setStatus("done");
        }
      } else {
        setStatus("done");
      }
    } catch (e) {
      setStatus("error");
      setBody(e instanceof Error ? e.message : "생성 실패");
    }
  }

  async function copy(plain: boolean) {
    const text = plain ? stripMarkdown(body) : body;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!selectedClientId) {
    return (
      <p className="text-sm text-muted">
        상단에서 클라이언트를 선택하세요. (시드/마이그레이션 실행 필요)
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">콘텐츠 생성</h1>
        <p className="mt-1 text-sm text-muted">
          {selectedClient?.name} · 프리셋 기반 통합 생성 엔진
        </p>
      </div>

      {/* 채널 탭 */}
      <div className="flex flex-wrap gap-2">
        {channels.map((c) => {
          const def = getChannel(c.channel);
          const active = c.channel === channel;
          return (
            <button
              key={c.id}
              onClick={() => setChannel(c.channel)}
              className={[
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-accent-deep bg-tint text-accent-deep"
                  : "border-border text-ink hover:bg-subtle",
              ].join(" ")}
            >
              {def?.label ?? c.channel}
            </button>
          );
        })}
        {channels.length === 0 && (
          <span className="text-sm text-muted">
            활성 채널이 없습니다. 설정에서 채널 프리셋을 확인하세요.
          </span>
        )}
      </div>

      {/* 유형 선택 (스레드 등) */}
      {hasContentTypes && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setContentType("auto")}
            className={[
              "rounded-full border px-3 py-1 text-xs font-medium",
              contentType === "auto"
                ? "border-accent-deep bg-tint text-accent-deep"
                : "border-border text-muted hover:bg-subtle",
            ].join(" ")}
          >
            자동 추천
          </button>
          {THREADS_CONTENT_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setContentType(t.key)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-medium",
                contentType === t.key
                  ? "border-accent-deep bg-tint text-accent-deep"
                  : "border-border text-muted hover:bg-subtle",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* 입력 */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">주제 / 소재</label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder="예: 지역 병원의 네이버 플레이스 상위노출 전략"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">추가 지시 (선택)</label>
          <textarea
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            rows={2}
            placeholder="예: CTA는 무료 점검 신청으로, 특정 키워드 포함 등"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
          />
        </div>
        <button
          onClick={generate}
          disabled={status === "streaming" || !channel || !topic.trim()}
          className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === "streaming" ? "생성 중…" : "생성"}
        </button>
      </div>

      {/* 결과 */}
      {(body || status !== "idle") && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">결과</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => copy(false)}
                className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-subtle"
              >
                {copied ? "복사됨" : "복사"}
              </button>
              <button
                onClick={() => copy(true)}
                className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-subtle"
              >
                플레인 텍스트 복사
              </button>
              <button
                onClick={generate}
                disabled={status === "streaming"}
                className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-subtle disabled:opacity-50"
              >
                다시 생성
              </button>
            </div>
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm leading-relaxed outline-none focus:border-accent-deep"
          />

          {meta && !meta.error && (
            <p className="text-xs text-muted">
              토큰: 입력 {meta.inputTokens.toLocaleString()} / 출력{" "}
              {meta.outputTokens.toLocaleString()} · 라이브러리에 저장됨
            </p>
          )}
          {meta?.error && (
            <p className="text-xs text-red-600">오류: {meta.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
