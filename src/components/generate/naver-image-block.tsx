"use client";

import { useEffect, useRef, useState } from "react";

interface NaverImage {
  url: string;
  alt: string;
  filename: string;
}

export function NaverImageBlock({
  clientId,
  keyword,
  body,
}: {
  clientId: string;
  keyword: string;
  body: string;
}) {
  const [phase, setPhase] = useState<"prompts" | "images" | "done" | "error">(
    "prompts",
  );
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [images, setImages] = useState<NaverImage[]>([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      try {
        const pr = await fetch("/api/generate/image-prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, keyword, body }),
        });
        const pd = await pr.json();
        if (!pd.ok || !Array.isArray(pd.image_prompts) || pd.image_prompts.length === 0) {
          setError(pd.error || "이미지 프롬프트를 만들지 못했습니다.");
          setPhase("error");
          return;
        }

        const prompts = pd.image_prompts as {
          prompt: string;
          alt_text: string;
          filename: string;
        }[];
        setPhase("images");
        setProgress({ current: 0, total: prompts.length });
        const collected: NaverImage[] = [];
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
              });
              setImages([...collected]);
            }
          } catch {
            // 개별 실패 건너뜀
          }
        }
        setPhase("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "이미지 생성 실패");
        setPhase("error");
      }
    }
    void run();
  }, [clientId, keyword, body]);

  async function download(img: NaverImage) {
    const res = await fetch(img.url);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = img.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyImage(img: NaverImage) {
    try {
      const res = await fetch(img.url);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setToast("이미지 복사됨 (에디터에 붙여넣기)");
    } catch {
      setToast("이 브라우저에서 이미지 복사가 지원되지 않아요. 다운로드를 이용하세요.");
    }
    setTimeout(() => setToast(""), 2000);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">생성 이미지</h3>

      {phase === "prompts" && (
        <p className="text-sm text-muted">이미지 프롬프트 준비 중…</p>
      )}
      {phase === "images" && (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            이미지 생성 중… ({progress.current}/{progress.total})
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{
                width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}
      {phase === "error" && <p className="text-sm text-red-600">{error}</p>}

      {images.length > 0 && (
        <div className="space-y-3">
          {images.map((img, i) => (
            <div key={i} className="space-y-2 rounded-md border border-border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt}
                className="w-full rounded-md border border-border object-cover"
              />
              <p className="text-xs text-muted">{img.alt}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => download(img)}
                  className="flex-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-subtle"
                >
                  다운로드
                </button>
                <button
                  onClick={() => copyImage(img)}
                  className="flex-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-subtle"
                >
                  이미지 복사
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {phase === "done" && images.length === 0 && (
        <p className="text-sm text-muted">생성된 이미지가 없습니다.</p>
      )}
      {toast && <p className="text-xs text-accent-deep">{toast}</p>}
    </div>
  );
}
