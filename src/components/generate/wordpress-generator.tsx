"use client";

import { useState } from "react";
import { assembleHtmlWithImages } from "@/lib/generation/html-images";
import { finalizeContentHtml } from "@/lib/actions/contents";

interface WpResult {
  contentId: string | null;
  content_html: string;
  meta_description: string;
  slug: string;
  faq: { question: string; answer: string }[];
  image_prompts: { prompt: string; alt_text: string; filename: string }[];
}
interface GenImage {
  url: string;
  alt: string;
}

type Phase =
  | "idle"
  | "content"
  | "images"
  | "ready"
  | "publishing";

const CONTENT_MSGS = [
  "글 구조 잡는 중…",
  "서론 작성 중…",
  "본문·표 작성 중…",
  "FAQ 생성 중…",
  "메타 데이터 설정 중…",
];

function faqToHtml(faq: { question: string; answer: string }[]): string {
  if (!faq?.length) return "";
  const items = faq
    .map((f) => `<h3>${f.question}</h3>\n<p>${f.answer}</p>`)
    .join("\n");
  return `\n<h2>자주 묻는 질문</h2>\n${items}`;
}

export function WordpressGenerator({
  clientId,
  planId,
  renderPlanFooter,
}: {
  clientId: string;
  planId: string | null;
  renderPlanFooter?: (ctx: {
    contentId: string | null;
    title: string;
    channel: string;
  }) => React.ReactNode;
}) {
  const [topic, setTopic] = useState("");
  const [keyword, setKeyword] = useState("");
  const [extra, setExtra] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [msgIdx, setMsgIdx] = useState(0);
  const [result, setResult] = useState<WpResult | null>(null);
  const [images, setImages] = useState<GenImage[]>([]);
  const [imgProgress, setImgProgress] = useState({ current: 0, total: 0 });
  const [finalHtml, setFinalHtml] = useState("");
  const [error, setError] = useState("");
  const [wpMsg, setWpMsg] = useState("");

  async function runImages(data: WpResult) {
    const prompts = data.image_prompts ?? [];
    if (prompts.length === 0) {
      const html = data.content_html + faqToHtml(data.faq);
      setFinalHtml(html);
      if (data.contentId) await finalizeContentHtml(data.contentId, html, []);
      setPhase("ready");
      return;
    }

    setPhase("images");
    setImgProgress({ current: 0, total: prompts.length });
    const collected: GenImage[] = [];

    for (let i = 0; i < prompts.length; i++) {
      setImgProgress({ current: i + 1, total: prompts.length });
      try {
        const res = await fetch("/api/images/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            prompt: prompts[i].prompt,
            alt: prompts[i].alt_text,
            filename: prompts[i].filename,
          }),
        });
        const d = await res.json();
        if (d.ok) {
          collected.push({ url: d.url, alt: d.alt || prompts[i].alt_text });
          setImages([...collected]);
        }
      } catch {
        // 개별 이미지 실패는 건너뜀
      }
    }

    const html =
      assembleHtmlWithImages(data.content_html, collected) + faqToHtml(data.faq);
    setFinalHtml(html);
    if (data.contentId) {
      await finalizeContentHtml(
        data.contentId,
        html,
        collected.map((c) => c.url),
      );
    }
    setPhase("ready");
  }

  async function generate() {
    if (!topic.trim()) return;
    setPhase("content");
    setError("");
    setResult(null);
    setImages([]);
    setFinalHtml("");
    setWpMsg("");
    setMsgIdx(0);
    const iv = setInterval(
      () => setMsgIdx((p) => Math.min(p + 1, CONTENT_MSGS.length - 1)),
      3000,
    );

    try {
      const res = await fetch("/api/generate/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, topic, keyword, extraInstructions: extra, planId }),
      });
      clearInterval(iv);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "생성 실패");
        setPhase("idle");
        return;
      }
      setResult(data as WpResult);
      await runImages(data as WpResult);
    } catch (e) {
      clearInterval(iv);
      setError(e instanceof Error ? e.message : "생성 실패");
      setPhase("idle");
    }
  }

  async function publish() {
    if (!result) return;
    setPhase("publishing");
    setWpMsg("");
    try {
      const res = await fetch("/api/wordpress/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          title: topic.trim().slice(0, 120),
          contentHtml: finalHtml || result.content_html,
          contentId: result.contentId,
        }),
      });
      const d = await res.json();
      setWpMsg(d.ok ? `WP 초안 발행 완료 (post #${d.wpPostId})` : `실패: ${d.error}`);
    } catch (e) {
      setWpMsg(e instanceof Error ? e.message : "발행 실패");
    } finally {
      setPhase("ready");
    }
  }

  // ── 입력 폼 ──
  if (phase === "idle" || phase === "content") {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">메인 키워드</label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="예: 피부과 마케팅"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent-deep"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">주제 / 제목</label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder="예: 피부과가 네이버·구글 검색에서 살아남는 법"
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
          disabled={phase === "content" || !topic.trim()}
          className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
        >
          {phase === "content" ? "생성 중…" : "생성 (구조화 + 이미지 자동)"}
        </button>
        {phase === "content" && (
          <p className="text-sm text-accent-deep">{CONTENT_MSGS[msgIdx]}</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  // ── 이미지 생성 진행 ──
  if (phase === "images") {
    const pct =
      imgProgress.total > 0 ? (imgProgress.current / imgProgress.total) * 100 : 0;
    return (
      <div className="space-y-4 py-6 text-center">
        <p className="text-sm font-semibold text-ink">
          이미지 생성 중… ({imgProgress.current}/{imgProgress.total})
        </p>
        <div className="mx-auto h-2 w-full max-w-sm overflow-hidden rounded-full bg-subtle">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {images.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3">
            {images.map((img, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.alt}
                  className="h-14 w-24 rounded-md border border-border object-cover"
                />
                <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent-deep text-[10px] font-bold text-white">
                  {i === 0 ? "T" : i}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── 결과 미리보기 ──
  if (!result) return null;
  const imageCount = images.length;
  const charCount = (finalHtml || result.content_html).replace(/<[^>]+>/g, "").length;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* 좌: 완성 글 렌더 */}
      <div className="lg:col-span-2">
        <article
          className="prose prose-sm max-w-none rounded-lg border border-border bg-surface p-5 prose-headings:text-ink prose-a:text-accent-deep prose-img:rounded-lg prose-strong:text-ink"
          dangerouslySetInnerHTML={{ __html: finalHtml || result.content_html }}
        />
      </div>

      {/* 우: 정보 패널 */}
      <div className="space-y-4">
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-ink">SEO 정보</h3>
          <PanelRow label="슬러그" value={`/${result.slug}`} />
          <PanelRow label="메타 디스크립션" value={result.meta_description} />
          <PanelRow label="이미지" value={`${imageCount}장 생성`} />
          <PanelRow label="FAQ" value={`${result.faq?.length ?? 0}개`} />
          <PanelRow label="글자 수" value={`${charCount.toLocaleString()}자`} />
          <PanelRow
            label="썸네일"
            value={imageCount > 0 ? "첫 이미지 상단 배치됨" : "없음"}
          />
        </div>

        {imageCount > 0 && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-2 text-sm font-semibold text-ink">
              생성된 이미지 ({imageCount})
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={img.url}
                  alt={img.alt}
                  className="h-20 w-full rounded-md border border-border object-cover"
                />
              ))}
            </div>
          </div>
        )}

        <button
          onClick={publish}
          disabled={phase === "publishing"}
          className="w-full rounded-md bg-accent-deep px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {phase === "publishing" ? "발행 중…" : "WP 초안으로 발행"}
        </button>
        {wpMsg && <p className="text-xs text-muted">{wpMsg}</p>}

        <button
          onClick={() => setPhase("idle")}
          className="w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-subtle"
        >
          새로 생성
        </button>

        {renderPlanFooter?.({
          contentId: result.contentId,
          title: topic.trim().slice(0, 120),
          channel: "wordpress",
        })}
      </div>
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
