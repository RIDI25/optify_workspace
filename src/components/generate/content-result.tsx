"use client";

import { useEffect, useState } from "react";
import { markdownToBasicHtml, stripMarkdown } from "@/lib/text";
import { createClient } from "@/lib/supabase/client";
import { SendToPlanFooter } from "@/components/generate/send-to-plan";
import {
  setPublishedStatus,
  deleteContent,
  approveContent,
  addComment,
  deleteComment,
} from "@/lib/actions/contents";
import type {
  ApprovalStatus,
  ContentComment,
  ContentImage,
  ContentMeta,
  Profile,
} from "@/types/database";

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
  /** 이미지 파이프라인 실패/부분 실패 알림 [AUDIT M-5] */
  imagesNotice?: string;
  /** WP 발행 버튼 노출 */
  canPublish?: boolean;
  /** 저장된 발행 완료 시각 (라이브러리에서 전달) [AUDIT M-1] */
  publishedAt?: string | null;
  /** 삭제 버튼 노출(라이브러리 전용) + 삭제 후 콜백 */
  canDelete?: boolean;
  onDeleted?: () => void;
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

function ImageCard({ img }: { img: ContentImage }) {
  const [toast, setToast] = useState("");

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }

  async function download() {
    const blob = await fetchBlob(img.url);
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = img.filename || "image.png";
    a.click();
    URL.revokeObjectURL(u);
  }

  async function copyImage() {
    try {
      const blob = await fetchBlob(img.url);
      const item: Record<string, Blob> = { [blob.type]: blob };
      // 이미지와 함께 제목 텍스트도 클립보드에 담는다 — 텍스트 붙여넣기 시 제목이 나온다
      if (img.title) {
        item["text/plain"] = new Blob([img.title], { type: "text/plain" });
      }
      await navigator.clipboard.write([new ClipboardItem(item)]);
      flash(img.title ? "이미지+제목 복사됨" : "복사됨");
    } catch {
      // 일부 브라우저는 복수 타입 미지원 — 이미지 단독으로 재시도
      try {
        const blob = await fetchBlob(img.url);
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
        flash("복사됨 (제목은 별도 복사)");
      } catch {
        flash("복사 미지원 — 다운로드 이용");
      }
    }
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    flash(`${label} 복사됨`);
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.url}
        alt={img.alt}
        className="w-full rounded-md border border-border object-cover"
      />
      {img.title && (
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-xs font-medium text-ink">
            <span className="text-muted">제목</span> {img.title}
          </p>
          <button
            onClick={() => copyText("제목", img.title!)}
            className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted hover:bg-subtle"
          >
            복사
          </button>
        </div>
      )}
      {img.alt && (
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-xs text-muted">
            <span className="font-medium">ALT</span> {img.alt}
          </p>
          <button
            onClick={() => copyText("ALT", img.alt)}
            className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted hover:bg-subtle"
          >
            복사
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={download}
          className="flex-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-subtle"
        >
          다운로드
        </button>
        <button
          onClick={copyImage}
          className="flex-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-subtle"
        >
          이미지 복사
        </button>
      </div>
      {toast && <p className="text-xs text-accent-deep">{toast}</p>}
    </div>
  );
}

function PanelRow({
  label,
  value,
  copyValue,
}: {
  label: string;
  value: string;
  /** 지정 시 복사 버튼 노출 — 표시값과 다른 원본값을 복사할 때 사용 */
  copyValue?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!copyValue) return;
    await navigator.clipboard.writeText(copyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        {copyValue && (
          <button
            onClick={copy}
            className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted hover:bg-subtle"
          >
            {copied ? "복사됨" : "복사"}
          </button>
        )}
      </div>
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
  const [markedPublished, setMarkedPublished] = useState(!!props.publishedAt);
  const [markMsg, setMarkMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

  // 승인 상태 + 현재 사용자 [Feature 3]
  const [meId, setMeId] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string>("");
  const [approval, setApproval] = useState<ApprovalStatus>("approved");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectText, setRejectText] = useState("");
  const [approvalMsg, setApprovalMsg] = useState("");

  useEffect(() => {
    if (!props.contentId) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setMeId(uid);
      if (uid) {
        supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .single()
          .then(({ data: p }) => setMeRole(p?.role ?? ""));
      }
    });
    supabase
      .from("contents")
      .select("approval_status")
      .eq("id", props.contentId)
      .single()
      .then(({ data }) => setApproval(data?.approval_status ?? "approved"));
  }, [props.contentId]);

  const isOwner = meRole === "owner";
  const isApproved = approval === "approved";

  async function decide(decision: "approved" | "rejected", comment?: string) {
    if (!props.contentId) return;
    const r = await approveContent(props.contentId, decision, comment);
    if (r.ok) {
      setApproval(decision);
      setApprovalMsg(decision === "approved" ? "승인됨" : "반려됨");
      setRejectOpen(false);
      setRejectText("");
    } else {
      setApprovalMsg(`실패: ${r.error}`);
    }
    setTimeout(() => setApprovalMsg(""), 2500);
  }

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

  async function togglePublished() {
    if (!props.contentId) return;
    const next = !markedPublished;
    const r = await setPublishedStatus(props.contentId, next);
    if (r.ok) {
      setMarkedPublished(next);
      setMarkMsg(next ? "발행 완료로 기록됨" : "발행 표시 해제됨");
    } else {
      setMarkMsg(`실패: ${r.error}`);
    }
    setTimeout(() => setMarkMsg(""), 2000);
  }

  async function onDelete() {
    if (!props.contentId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const r = await deleteContent(props.contentId);
    if (r.ok) props.onDeleted?.();
    else {
      setDeleteMsg(`삭제 실패: ${r.error}`);
      setConfirmDelete(false);
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
      <div className="space-y-3 lg:col-span-2">
        {props.title && (
          <h2 className="rounded-lg border border-border bg-surface px-5 py-3 text-lg font-bold text-ink">
            {props.title}
          </h2>
        )}
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
        {/* 승인 상태 [Feature 3] */}
        {props.contentId && (
          <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">승인 상태</h3>
              <ApprovalBadge status={approval} />
            </div>
            {approval === "pending" && (
              <p className="text-xs text-muted">
                승인 대기중 — 관리자 승인 후 발행할 수 있습니다.
              </p>
            )}
            {approval === "rejected" && (
              <p className="text-xs text-red-600">
                반려됨 — 아래 코멘트를 확인하고 수정 후 다시 요청하세요.
              </p>
            )}
            {isOwner && approval !== "approved" && (
              <div className="flex gap-2">
                <button
                  onClick={() => decide("approved")}
                  className="flex-1 rounded-md bg-accent-deep px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  승인
                </button>
                <button
                  onClick={() => setRejectOpen(true)}
                  className="flex-1 rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  반려
                </button>
              </div>
            )}
            {isOwner && approval === "approved" && (
              <button
                onClick={() => setRejectOpen(true)}
                className="w-full rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:bg-subtle"
              >
                승인 취소(반려)
              </button>
            )}
            {approvalMsg && <p className="text-xs text-muted">{approvalMsg}</p>}
          </div>
        )}

        {/* 플랜 연결·날짜 지정은 승인과 무관한 기획 행위 — owner/member·승인상태 무관하게 상단 노출 [Fix 1] */}
        {props.contentId && footer}

        {isWp && (
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink">SEO 정보</h3>
            <PanelRow
              label="슬러그"
              value={meta?.slug ? `/${meta.slug}` : "-"}
              copyValue={
                meta?.slug ? meta.slug.replace(/\//g, "") : undefined
              }
            />
            <PanelRow
              label="메타 디스크립션"
              value={meta?.meta_description ?? "-"}
              copyValue={meta?.meta_description || undefined}
            />
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

        {/* WP 발행 — 승인 게이트 */}
        {isWp && props.canPublish && (
          <div className="space-y-2">
            <button
              onClick={publish}
              disabled={publishing || !isApproved}
              className="w-full rounded-md bg-accent-deep px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {publishing ? "발행 중…" : "WP 초안으로 발행"}
            </button>
            {!isApproved && (
              <p className="text-xs text-muted">승인 후 발행할 수 있습니다.</p>
            )}
            {wpMsg && <p className="text-xs text-muted">{wpMsg}</p>}
            {thumb && <p className="text-xs text-muted">{thumb}</p>}
          </div>
        )}

        {/* 생성 이미지 (다운로드/복사 + 제목·ALT) — 실패 시에도 블록 유지해 알림 표시 */}
        {(isNaver || isWp) &&
          (props.imagesGenerating || images.length > 0 || props.imagesNotice) && (
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
              {props.imagesNotice && (
                <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-600">
                  {props.imagesNotice}
                </p>
              )}
              {images.map((img, i) => (
                <ImageCard key={i} img={img} />
              ))}
            </div>
          )}

        {/* 발행 완료 수동 표시 — 승인 게이트 [AUDIT M-1 / Feature 3] */}
        {props.contentId && (
          <div className="space-y-1">
            <button
              onClick={togglePublished}
              disabled={!isApproved}
              className={[
                "w-full rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50",
                markedPublished
                  ? "border-accent-deep bg-tint text-accent-deep"
                  : "border-border text-ink hover:bg-subtle",
              ].join(" ")}
            >
              {markedPublished ? "✓ 발행 완료 (클릭 시 해제)" : "발행 완료로 표시"}
            </button>
            {!isApproved && (
              <p className="text-xs text-muted">승인 후 표시할 수 있습니다.</p>
            )}
            {markMsg && <p className="text-xs text-muted">{markMsg}</p>}
          </div>
        )}

        {/* 코멘트 스레드 [Feature 3] */}
        {props.contentId && (
          <CommentThread contentId={props.contentId} meId={meId} />
        )}

        {props.canDelete && props.contentId && (
          <div className="space-y-1 border-t border-border pt-3">
            <button
              onClick={onDelete}
              className={[
                "w-full rounded-md border px-3 py-2 text-sm font-medium",
                confirmDelete
                  ? "border-red-500 bg-red-50 text-red-600"
                  : "border-border text-muted hover:bg-subtle",
              ].join(" ")}
            >
              {confirmDelete
                ? "정말 삭제할까요? 되돌릴 수 없습니다 (다시 클릭)"
                : "이 콘텐츠 삭제"}
            </button>
            {confirmDelete && (
              <button
                onClick={() => setConfirmDelete(false)}
                className="w-full rounded-md px-3 py-1 text-xs text-muted hover:text-ink"
              >
                취소
              </button>
            )}
            {deleteMsg && <p className="text-xs text-red-600">{deleteMsg}</p>}
          </div>
        )}
      </div>

      {/* 반려 사유 입력 모달 */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-surface p-5 shadow-lg">
            <h3 className="text-base font-bold text-ink">반려 사유</h3>
            <textarea
              value={rejectText}
              onChange={(e) => setRejectText(e.target.value)}
              rows={4}
              placeholder="수정이 필요한 부분을 코멘트로 남겨주세요."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRejectOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-subtle"
              >
                취소
              </button>
              <button
                onClick={() => decide("rejected", rejectText)}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                반려 확정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const map: Record<ApprovalStatus, { label: string; cls: string }> = {
    pending: { label: "승인 대기", cls: "bg-subtle text-muted" },
    approved: { label: "승인됨", cls: "bg-tint text-accent-deep" },
    rejected: { label: "반려됨", cls: "bg-red-50 text-red-600" },
  };
  const m = map[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

export function CommentThread({
  contentId,
  meId,
}: {
  contentId: string;
  meId: string | null;
}) {
  const [comments, setComments] = useState<ContentComment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const supabase = createClient();
    const [{ data: cs }, { data: ps }] = await Promise.all([
      supabase
        .from("content_comments")
        .select("*")
        .eq("content_id", contentId)
        .order("created_at"),
      supabase.from("profiles").select("*"),
    ]);
    setComments((cs ?? []) as ContentComment[]);
    setProfiles((ps ?? []) as Profile[]);
  }

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    Promise.all([
      supabase
        .from("content_comments")
        .select("*")
        .eq("content_id", contentId)
        .order("created_at"),
      supabase.from("profiles").select("*"),
    ]).then(([{ data: cs }, { data: ps }]) => {
      if (!active) return;
      setComments((cs ?? []) as ContentComment[]);
      setProfiles((ps ?? []) as Profile[]);
    });
    return () => {
      active = false;
    };
  }, [contentId]);

  const name = (id: string | null) =>
    profiles.find((p) => p.id === id)?.name ?? "?";

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    const r = await addComment(contentId, body);
    setBusy(false);
    if (r.ok) {
      setBody("");
      void load();
    }
  }

  async function remove(id: string) {
    const r = await deleteComment(id);
    if (r.ok) setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">코멘트</h3>
      {comments.length === 0 ? (
        <p className="text-xs text-muted">아직 코멘트가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md bg-subtle p-2 text-sm">
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-xs font-medium text-ink">
                  {name(c.author)}
                </span>
                <span className="flex items-center gap-2 text-[11px] text-muted">
                  {c.created_at.slice(0, 16).replace("T", " ")}
                  {c.author === meId && (
                    <button
                      onClick={() => remove(c.id)}
                      className="hover:text-red-600"
                    >
                      삭제
                    </button>
                  )}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-ink">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="코멘트 입력…"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent-deep"
        />
        <button
          onClick={submit}
          disabled={busy || !body.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
        >
          등록
        </button>
      </div>
    </div>
  );
}
