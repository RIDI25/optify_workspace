"use client";

import { useEffect, useRef, useState } from "react";
import { saveContentAssets } from "@/lib/actions/contents";
import { ContentResultView } from "@/components/generate/content-result";
import type { ContentImage } from "@/types/database";

/**
 * 네이버 결과 화면: 본문 렌더(공유 컴포넌트) + 이미지 파이프라인 자동 실행.
 * 이미지는 본문에 삽입하지 않고 생성 이미지 블록에 표시(다운로드/복사).
 */
export function NaverResult({
  clientId,
  planId,
  contentId,
  title,
  body,
}: {
  clientId: string;
  planId: string | null;
  contentId: string | null;
  title: string;
  body: string;
}) {
  const [images, setImages] = useState<ContentImage[]>([]);
  const [generating, setGenerating] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [notice, setNotice] = useState(""); // 실패/부분 실패 알림 [AUDIT M-5]
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      try {
        const pr = await fetch("/api/generate/image-prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, keyword: title, body }),
        });
        const pd = await pr.json();
        if (!pd.ok) {
          setNotice(`이미지 프롬프트 생성 실패: ${pd.error ?? "알 수 없음"}`);
          return;
        }
        const prompts: {
          prompt: string;
          title?: string;
          alt_text: string;
          filename: string;
        }[] = Array.isArray(pd.image_prompts) ? pd.image_prompts : [];

        if (prompts.length === 0) {
          setNotice("생성할 이미지 프롬프트가 없습니다.");
          return;
        }
        setProgress({ current: 0, total: prompts.length });
        const collected: ContentImage[] = [];
        let failed = 0;
        for (let i = 0; i < prompts.length; i++) {
          setProgress({ current: i + 1, total: prompts.length });
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
          setNotice(`이미지 ${prompts.length}장 중 ${failed}장 생성 실패`);
        }
        if (contentId && collected.length > 0) {
          await saveContentAssets(contentId, { images: collected });
        }
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "이미지 생성 실패");
      } finally {
        setGenerating(false);
      }
    }
    void run();
  }, [clientId, contentId, title, body]);

  return (
    <ContentResultView
      channel="naver_blog"
      clientId={clientId}
      contentId={contentId}
      planId={planId}
      title={title}
      body={body}
      images={images}
      imagesGenerating={generating}
      imagesProgress={progress}
      imagesNotice={notice}
    />
  );
}
