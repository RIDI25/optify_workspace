"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { ServiceBanner } from "@/components/layout/service-banner";
import { getChannel, THREADS_CONTENT_TYPES } from "@/lib/channels";
import {
  NAVER_CATEGORIES,
  NAVER_CATEGORY_MARKER_RE,
} from "@/lib/naver-categories";
import { stripMarkdown } from "@/lib/text";
import {
  META_DELIMITER,
  type StreamMeta,
} from "@/lib/generation/stream-protocol";
import { WordpressGenerator } from "@/components/generate/wordpress-generator";
import { SendToPlanFooter } from "@/components/generate/send-to-plan";
import { NaverResult } from "@/components/generate/naver-result";
import { saveContentAssets } from "@/lib/actions/contents";
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
  const [naverCategory, setNaverCategory] = useState<string>("auto");
  const [topic, setTopic] = useState(() => searchParams.get("title") ?? "");
  const [extra, setExtra] = useState("");

  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">(
    "idle",
  );
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [copied, setCopied] = useState<string>("");
  // 화면에서 고친 본문이 라이브러리에 저장됐는지 (코덱스 08)
  const [savedBody, setSavedBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    if (!selectedClientId) return;
    const supabase = createClient();
    supabase
      .from("channel_settings")
      // 필요한 컬럼만 — wp_app_password_encrypted 등 비밀 컬럼을 브라우저로 내리지 않는다 [AUDIT H-2]
      .select("id, channel")
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
    setSavedBody("");
    setSaveMsg("");
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
          naverCategory: isNaver && selectedClient?.is_internal ? naverCategory : null,
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
        // 서버가 DB 저장분에서 카테고리 마커를 제거하므로 화면 표시분도 동일하게 제거
        const finalBody = buffer.slice(0, idx).replace(NAVER_CATEGORY_MARKER_RE, "").trimEnd();
        setBody(finalBody);
        setSavedBody(finalBody); // 서버가 이 본문을 라이브러리에 저장했다
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
        setSavedBody(buffer);
        setStatus("done");
      }
    } catch (e) {
      setStatus("error");
      setBody(e instanceof Error ? e.message : "생성 실패");
    }
  }

  const dirty = status === "done" && !!meta?.contentId && body !== savedBody;

  async function saveBody() {
    if (!meta?.contentId) return;
    setSaving(true);
    setSaveMsg("");
    const r = await saveContentAssets(meta.contentId, { body });
    setSaving(false);
    if (r.ok) {
      setSavedBody(body);
      setSaveMsg("저장됨");
      setTimeout(() => setSaveMsg(""), 1500);
    } else {
      setSaveMsg(`저장 실패: ${r.error ?? "알 수 없음"}`);
    }
  }

  async function copy(kind: "formatted" | "plain") {
    await navigator.clipboard.writeText(
      kind === "plain" ? stripMarkdown(body) : body,
    );
    setCopied(kind);
    setTimeout(() => setCopied(""), 1500);
  }

  if (!selectedClientId) {
    return (
      <p className="text-sm text-muted">
        왼쪽 메뉴에서 고객사를 선택하세요. (시드/마이그레이션 실행 필요)
      </p>
    );
  }

  const naverReady = isNaver && status === "done" && !!body;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">콘텐츠 생성</h1>
        <p className="mt-1 text-sm text-muted">
          {selectedClient?.name} · 프리셋 기반 통합 생성 엔진
        </p>
      </div>

      <ServiceBanner />

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
        <WordpressGenerator
          clientId={selectedClientId}
          planId={planId}
          initialTopic={topic}
          initialKeyword={searchParams.get("keyword") ?? ""}
        />
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

          {/* 네이버 블로그 카테고리 선택 — 옵티파이 자체 블로그 체계라 내부 고객사에만 표시 (외부 고객사는 채널 설정의 카테고리 사용) */}
          {isNaver && selectedClient?.is_internal && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">
                블로그 카테고리
              </label>
              <div className="flex flex-wrap gap-2">
                <TypeChip
                  active={naverCategory === "auto"}
                  label="자동 판정"
                  onClick={() => setNaverCategory("auto")}
                />
                {NAVER_CATEGORIES.filter((c) => c.aiWritable).map((c) => (
                  <TypeChip
                    key={c.key}
                    active={naverCategory === c.key}
                    label={c.label}
                    onClick={() => setNaverCategory(c.key)}
                  />
                ))}
              </div>
              <p className="text-xs text-muted">
                카테고리 특성에 맞는 각도로 작성됩니다. &lsquo;옵티파이
                안내&rsquo;는 대표 직접 작성 영역이라 제외되어 있습니다.
                {naverCategory === "industry" &&
                  " · 업종별 마케팅 글은 발행 전 대표 승인이 필요합니다."}
              </p>
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

          {/* 결과 */}
          {naverReady ? (
            <div className="space-y-3">
              {meta?.naverCategory && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-tint px-3 py-1.5 text-sm font-semibold text-accent-deep">
                    📁 카테고리 - {meta.naverCategory}
                  </span>
                  <span className="text-xs text-muted">
                    네이버 블로그에서 이 카테고리에 등록하세요.
                  </span>
                </div>
              )}
              <NaverResult
                key={meta?.contentId ?? "naver"}
                clientId={selectedClientId}
                planId={planId}
                contentId={meta?.contentId ?? null}
                title={topic.trim().slice(0, 120)}
                body={body}
              />
            </div>
          ) : (
            (body || status !== "idle") && (
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
                    {dirty && (
                      <button
                        onClick={saveBody}
                        disabled={saving}
                        className="rounded-md bg-accent-deep px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {saving ? "저장 중…" : "수정 내용 저장"}
                      </button>
                    )}
                    {saveMsg && <span className="text-xs text-muted">{saveMsg}</span>}
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
                    {meta.outputTokens.toLocaleString()} ·{" "}
                    {dirty ? (
                      <span className="text-amber-700">수정 내용이 아직 저장되지 않았습니다</span>
                    ) : (
                      "라이브러리에 저장됨"
                    )}
                  </p>
                )}
                {meta?.error && (
                  <p className="text-xs text-red-600">오류: {meta.error}</p>
                )}
                {status === "done" && meta?.contentId && dirty && (
                  <p className="text-xs text-muted">수정한 본문을 먼저 저장하면 완료 처리할 수 있습니다.</p>
                )}
                {status === "done" && meta?.contentId && !dirty && (
                  <div className="max-w-xs">
                    <SendToPlanFooter
                      clientId={selectedClientId}
                      planId={planId}
                      channel={channel}
                      title={topic.trim().slice(0, 120)}
                      contentId={meta.contentId}
                    />
                  </div>
                )}
              </div>
            )
          )}
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
