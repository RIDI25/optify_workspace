"use client";

import { useState } from "react";
import { assembleHtmlWithImages } from "@/lib/generation/html-images";
import { saveContentAssets } from "@/lib/actions/contents";
import { ContentResultView } from "@/components/generate/content-result";
import type { ContentImage } from "@/types/database";

interface WpResult {
  contentId: string | null;
  content_html: string;
  meta_description: string;
  slug: string;
  faq: { question: string; answer: string }[];
  image_prompts: {
    prompt: string;
    title?: string;
    alt_text: string;
    filename: string;
  }[];
}

type Phase = "idle" | "content" | "images" | "ready";

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
  initialTopic,
  initialKeyword,
}: {
  clientId: string;
  planId: string | null;
  /** 플랜에서 진입 시 제목/키워드 프리필 [AUDIT H-3] */
  initialTopic?: string;
  initialKeyword?: string;
}) {
  const [topic, setTopic] = useState(() => initialTopic ?? "");
  const [keyword, setKeyword] = useState(() => initialKeyword ?? "");
  const [extra, setExtra] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [msgIdx, setMsgIdx] = useState(0);
  const [result, setResult] = useState<WpResult | null>(null);
  const [images, setImages] = useState<ContentImage[]>([]);
  const [imgProgress, setImgProgress] = useState({ current: 0, total: 0 });
  const [imgNotice, setImgNotice] = useState(""); // 이미지 부분 실패 알림 [AUDIT M-5]
  const [finalHtml, setFinalHtml] = useState("");
  const [error, setError] = useState("");

  async function runImages(data: WpResult) {
    const prompts = data.image_prompts ?? [];
    if (prompts.length === 0) {
      const html = data.content_html + faqToHtml(data.faq);
      setFinalHtml(html);
      if (data.contentId)
        await saveContentAssets(data.contentId, {
          body: html,
          images: [],
          meta: { slug: data.slug, meta_description: data.meta_description, faq: data.faq },
        });
      setPhase("ready");
      return;
    }

    setPhase("images");
    setImgProgress({ current: 0, total: prompts.length });
    setImgNotice("");
    const collected: ContentImage[] = [];
    let failed = 0;

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
          collected.push({
            url: d.url,
            alt: d.alt || prompts[i].alt_text,
            filename: d.filename || prompts[i].filename,
            title: prompts[i].title,
          });
          setImages([...collected]);
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
    if (failed > 0) {
      setImgNotice(`이미지 ${prompts.length}장 중 ${failed}장 생성 실패 — 나머지로 본문을 구성했습니다.`);
    }

    const html = assembleHtmlWithImages(data.content_html, collected) + faqToHtml(data.faq);
    setFinalHtml(html);
    if (data.contentId) {
      await saveContentAssets(data.contentId, {
        body: html,
        images: collected,
        meta: { slug: data.slug, meta_description: data.meta_description, faq: data.faq },
      });
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

  // ── 결과 ──
  if (!result) return null;
  return (
    <div className="space-y-3">
      {imgNotice && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {imgNotice}
        </p>
      )}
      <ContentResultView
        channel="wordpress"
        clientId={clientId}
        contentId={result.contentId}
        planId={planId}
        title={topic.trim().slice(0, 120)}
        body={finalHtml || result.content_html}
        meta={{
          slug: result.slug,
          meta_description: result.meta_description,
          faq: result.faq,
        }}
        images={images}
        canPublish
      />
      <button
        onClick={() => setPhase("idle")}
        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-subtle"
      >
        새로 생성
      </button>
    </div>
  );
}
