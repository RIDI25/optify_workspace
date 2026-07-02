"use client";

import { useState } from "react";
import { markdownToBasicHtml, stripMarkdown } from "@/lib/text";
import { SendToPlanFooter } from "@/components/generate/send-to-plan";
import type { ContentImage, ContentMeta } from "@/types/database";

export interface ContentResultData {
  channel: string;
  clientId: string;
  contentId: string | null;
  planId?: string | null;
  title: string;
  /** 원본 본문: 워프=HTML, 네이버=마크다운, 스레드=텍스트 */
  body: string;
  meta?: ContentMeta | null;
  images?: ContentImage[];
  /** 네이버 라이브 생성 중 진행 표시(선택) */
  imagesGenerating?: boolean;
  imagesProgress?: { current: number; total: number };
  /** WP 발행 버튼 노출 */
  canPublish?: boolean;
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

function ImageCard({ img }: { img: ContentImage }) {
  const [toast, setToast] = useState("");
  async function download() {
    const blob = await fetchBlob(img.url);
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = img.filename || "image.png";
    a.click();
    URL.revokeObjectURL(u);
  }
  async function copy() {
    try {
      const blob = await fetchBlob(img.url);
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setToast("복사됨");
    } catch {
      setToast("복사 미지원 — 다운로드 이용");
    }
    setTimeout(() => setToast(""), 1800);
  }
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.url}
        alt={img.alt}
        className="w-full rounded-md border border-border object-cover"
      />
      {img.alt && <p className="text-xs text-muted">{img.alt}</p>}
      <div className="flex gap-2">
        <button
          onClick={download}
          className="flex-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-subtle"
        >
          다운로드
        </button>
        <button
          onClick={copy}
          className="flex-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-subtle"
        >
          이미지 복사
        </button>
      </div>
      {toast && <p className="text-xs text-accent-deep">{toast}</p>}
    </div>
  );
}

function PanelRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium text-muted">{label}</p>
      <p className="break-all rounded-md bg-subtle px-2.5 py-1.5 text-sm text-ink">
        {value || "-"}
      </p>
    </div>
  );
}

export function ContentResultView(props: ContentResultData) {
  const { channel, body, meta, images = [] } = props;
  const isWp = channel === "wordpress";
  const isNaver = channel === "naver_blog";

  const [copied, setCopied] = useState("");
  const [wpMsg, setWpMsg] = useState("");
  const [thumb, setThumb] = useState<string>("");
  const [publishing, setPublishing] = useState(false);

  const displayHtml = isWp
    ? body
    : isNaver
      ? markdownToBasicHtml(body)
      : "";

  const charCount = isWp
    ? body.replace(/<[^>]+>/g, "").length
    : stripMarkdown(body).length;
  const naverImageMarkers = (body.match(/\[이미지[:：]/g) ?? []).length;

  async function copy(kind: "formatted" | "plain") {
    await navigator.clipboard.writeText(
      kind === "plain" ? stripMarkdown(body) : body,
    );
    setCopied(kind);
    setTimeout(() => setCopied(""), 1500);
  }

  async function publish() {
    setPublishing(true);
    setWpMsg("");
    setThumb("");
    try {
      const res = await fetch("/api/wordpress/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: props.clientId,
          title: props.title,
          contentHtml: body,
          contentId: props.contentId,
          featuredImage: images[0] ?? null,
        }),
      });
      const d = await res.json();
      setWpMsg(d.ok ? `WP 초안 발행 완료 (post #${d.wpPostId})` : `실패: ${d.error}`);
      if (d.ok) {
        setThumb(
          d.thumbnailSet
            ? "썸네일(Featured Image) 설정됨"
            : d.thumbnailError
              ? `썸네일 실패: ${d.thumbnailError}`
              : "썸네일 없음",
        );
      }
    } catch (e) {
      setWpMsg(e instanceof Error ? e.message : "발행 실패");
    } finally {
      setPublishing(false);
    }
  }

  const footer = (
    <SendToPlanFooter
      clientId={props.clientId}
      planId={props.planId ?? null}
      channel={channel}
      title={props.title}
      contentId={props.contentId}
    />
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* 좌: 완성 글 렌더 */}
      <div className="lg:col-span-2">
        {displayHtml ? (
          <article
            className="prose prose-sm max-w-none rounded-lg border border-border bg-surface p-5 prose-headings:text-ink prose-a:text-accent-deep prose-img:rounded-lg prose-strong:text-ink"
            dangerouslySetInnerHTML={{ __html: displayHtml }}
          />
        ) : (
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-5 font-sans text-sm leading-relaxed text-ink">
            {body}
          </pre>
        )}
      </div>

      {/* 우: 채널별 패널 */}
      <div className="space-y-4">
        {isWp && (
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink">SEO 정보</h3>
            <PanelRow label="슬러그" value={meta?.slug ? `/${meta.slug}` : "-"} />
            <PanelRow label="메타 디스크립션" value={meta?.meta_description ?? "-"} />
            <PanelRow label="FAQ" value={`${meta?.faq?.length ?? 0}개`} />
            <PanelRow label="이미지" value={`${images.length}장`} />
            <PanelRow label="글자 수" value={`${charCount.toLocaleString()}자`} />
          </div>
        )}

        {isNaver && (
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink">네이버 정보</h3>
            <PanelRow label="글자 수" value={`${charCount.toLocaleString()}자`} />
            <PanelRow label="[이미지: 설명] 위치" value={`${naverImageMarkers}곳`} />
          </div>
        )}

        {/* 복사 (네이버/스레드) */}
        {!isWp && (
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
          </div>
        )}

        {/* WP 발행 */}
        {isWp && props.canPublish && (
          <div className="space-y-2">
            <button
              onClick={publish}
              disabled={publishing}
              className="w-full rounded-md bg-accent-deep px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {publishing ? "발행 중…" : "WP 초안으로 발행"}
            </button>
            {wpMsg && <p className="text-xs text-muted">{wpMsg}</p>}
            {thumb && <p className="text-xs text-muted">{thumb}</p>}
          </div>
        )}

        {/* 생성 이미지 (네이버: 다운로드/복사용) */}
        {isNaver && (props.imagesGenerating || images.length > 0) && (
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink">생성 이미지</h3>
            {props.imagesGenerating && (
              <p className="text-sm text-muted">
                이미지 생성 중…{" "}
                {props.imagesProgress
                  ? `(${props.imagesProgress.current}/${props.imagesProgress.total})`
                  : ""}
              </p>
            )}
            {images.map((img, i) => (
              <ImageCard key={i} img={img} />
            ))}
          </div>
        )}

        {props.contentId && footer}
      </div>
    </div>
  );
}
