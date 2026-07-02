"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { getChannel, THREADS_CONTENT_TYPES } from "@/lib/channels";
import { stripMarkdown, markdownToBasicHtml } from "@/lib/text";
import {
  META_DELIMITER,
  type StreamMeta,
} from "@/lib/generation/stream-protocol";
import { WordpressGenerator } from "@/components/generate/wordpress-generator";
import type { ChannelSettings } from "@/types/database";

export function GenerateView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");

  const [channels, setChannels] = useState<ChannelSettings[]>([]);
  const [channel, setChannel] = useState<string>(
    () => searchParams.get("channel") ?? "",
  );
  const [contentType, setContentType] = useState<string>("auto");
  const [topic, setTopic] = useState(() => searchParams.get("title") ?? "");
  const [extra, setExtra] = useState("");

  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">(
    "idle",
  );
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [copied, setCopied] = useState<string>("");

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
  const isNaver = channel === "naver_blog";

  async function generate() {
    if (!selectedClientId || !channel || !topic.trim()) return;
    setStatus("streaming");
    setBody("");
    setMeta(null);
    setCopied("");

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
        setBody(idx === -1 ? buffer : buffer.slice(0, idx));
      }

      const idx = buffer.indexOf(META_DELIMITER);
      if (idx !== -1) {
        setBody(buffer.slice(0, idx));
        try {
          const m = JSON.parse(
            buffer.slice(idx + META_DELIMITER.length),
          ) as StreamMeta;
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

  async function copy(kind: "formatted" | "plain") {
    const text = kind === "plain" ? stripMarkdown(body) : body;
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(""), 1500);
  }

  if (!selectedClientId) {
    return (
      <p className="text-sm text-muted">
        상단에서 클라이언트를 선택하세요. (시드/마이그레이션 실행 필요)
      </p>
    );
  }

  const naverImageMarkers = (body.match(/\[이미지[:：]/g) ?? []).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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

      {channel === "wordpress" ? (
        <WordpressGenerator clientId={selectedClientId} planId={planId} />
      ) : (
        <>
          {/* 유형 선택 (스레드) */}
          {hasContentTypes && (
            <div className="flex flex-wrap gap-2">
              <TypeChip
                active={contentType === "auto"}
                label="자동 추천"
                onClick={() => setContentType("auto")}
              />
              {THREADS_CONTENT_TYPES.map((t) => (
                <TypeChip
                  key={t.key}
                  active={contentType === t.key}
                  label={t.label}
                  onClick={() => setContentType(t.key)}
                />
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

          {/* 네이버: 렌더 미리보기 + 패널 / 스레드: 텍스트 편집 */}
          {(body || status !== "idle") &&
            (isNaver && status !== "streaming" && body ? (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <article
                  className="prose prose-sm max-w-none rounded-lg border border-border bg-surface p-5 prose-headings:text-ink prose-a:text-accent-deep prose-strong:text-ink"
                  dangerouslySetInnerHTML={{ __html: markdownToBasicHtml(body) }}
                />
                <div className="space-y-4">
                  <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
                    <h3 className="text-sm font-semibold text-ink">네이버 정보</h3>
                    <PanelRow
                      label="글자 수"
                      value={`${stripMarkdown(body).length.toLocaleString()}자`}
                    />
                    <PanelRow
                      label="[이미지: 설명] 위치"
                      value={`${naverImageMarkers}곳`}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => copy("formatted")}
                      className="rounded-md border border-border px-3 py-2 text-sm hover:bg-subtle"
                    >
                      {copied === "formatted" ? "복사됨" : "서식 유지 복사"}
                    </button>
                    <button
                      onClick={() => copy("plain")}
                      className="rounded-md border border-border px-3 py-2 text-sm hover:bg-subtle"
                    >
                      {copied === "plain" ? "복사됨" : "플레인 텍스트 복사"}
                    </button>
                    <button
                      onClick={generate}
                      className="rounded-md border border-border px-3 py-2 text-sm hover:bg-subtle"
                    >
                      다시 생성
                    </button>
                  </div>
                  {meta && !meta.error && (
                    <p className="text-xs text-muted">
                      토큰 {meta.inputTokens.toLocaleString()} /{" "}
                      {meta.outputTokens.toLocaleString()} · 라이브러리 저장됨
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">결과</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copy("formatted")}
                      className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-subtle"
                    >
                      {copied === "formatted" ? "복사됨" : "복사"}
                    </button>
                    <button
                      onClick={() => copy("plain")}
                      className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-subtle"
                    >
                      플레인 복사
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
            ))}
        </>
      )}
    </div>
  );
}

function TypeChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs font-medium",
        active
          ? "border-accent-deep bg-tint text-accent-deep"
          : "border-border text-muted hover:bg-subtle",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function PanelRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium text-muted">{label}</p>
      <p className="rounded-md bg-subtle px-2.5 py-1.5 text-sm text-ink">
        {value}
      </p>
    </div>
  );
}
