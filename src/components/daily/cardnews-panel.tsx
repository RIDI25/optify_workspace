"use client";

import { useState } from "react";
import type { CardCopy } from "@/app/api/cardnews/copy/route";

/**
 * 데일리 리포트 → 카드뉴스 생성 패널.
 * 카피는 Claude, 배경 일러스트는 OpenAI(gpt-image-1), 텍스트 합성은 브라우저 캔버스(1080×1080).
 * 텍스트를 캔버스에서 얹는 이유: AI 이미지의 한글 렌더링 불안정 → 가독성 보장.
 */

const W = 1080;
const H = 1080;
const ACCENT = "#00E87B";
const DEEP = "#057A4E";
const INK = "#1A2421";
const MUTED = "#6b7772";
const FONT = '"Pretendard Variable", Pretendard, sans-serif';

interface CardState extends CardCopy {
  bg?: string; // 배경 이미지 dataUrl
  png?: string; // 합성 결과 dataUrl
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (ch === "\n") {
      lines.push(cur);
      cur = "";
      continue;
    }
    if (cur && ctx.measureText(cur + ch).width > maxWidth) {
      lines.push(cur.trimEnd());
      cur = ch === " " ? "" : ch;
    } else {
      cur += ch;
    }
  }
  if (cur) lines.push(cur.trimEnd());
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function composeCard(
  card: CardState,
  index: number,
  total: number,
  dateLabel: string,
): Promise<string> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── 배경 ──
  if (card.bg) {
    try {
      const img = await loadImage(card.bg);
      // cover-fit
      const scale = Math.max(W / img.width, H / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.fillStyle = "rgba(255,255,255,0.84)"; // 가독성 오버레이
      ctx.fillRect(0, 0, W, H);
    } catch {
      card.bg = undefined;
    }
  }
  if (!card.bg) {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#EAFBF2");
    grad.addColorStop(1, "#ffffff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // ── 헤더: 브랜드 + 날짜 ──
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(84, 92, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = `bold 32px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText("OPTIFY", 110, 94);
  ctx.font = `26px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = "right";
  ctx.fillText(`데일리 인사이트 · ${dateLabel}`, W - 76, 94);
  ctx.textAlign = "left";

  ctx.fillStyle = ACCENT;
  ctx.fillRect(76, 140, 120, 7);

  // ── 본문 ──
  const maxWidth = W - 152;
  if (card.type === "cover") {
    ctx.fillStyle = DEEP;
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillText("오늘의 검색 마케팅 소식", 76, 330);
    ctx.fillStyle = INK;
    ctx.font = `bold 82px ${FONT}`;
    const titleLines = wrapText(ctx, card.title, maxWidth);
    let y = 430;
    for (const line of titleLines) {
      ctx.fillText(line, 76, y);
      y += 108;
    }
    ctx.fillStyle = MUTED;
    ctx.font = `38px ${FONT}`;
    for (const raw of card.lines) {
      for (const line of wrapText(ctx, raw, maxWidth)) {
        ctx.fillText(line, 76, y + 20);
        y += 58;
      }
    }
  } else if (card.type === "outro") {
    ctx.fillStyle = INK;
    ctx.font = `bold 62px ${FONT}`;
    let y = 420;
    for (const line of wrapText(ctx, card.title, maxWidth)) {
      ctx.fillText(line, 76, y);
      y += 84;
    }
    ctx.fillStyle = "#3d5248";
    ctx.font = `38px ${FONT}`;
    y += 16;
    for (const raw of card.lines) {
      for (const line of wrapText(ctx, raw, maxWidth)) {
        ctx.fillText(line, 76, y);
        y += 60;
      }
    }
    ctx.fillStyle = DEEP;
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText("매일 아침, 검색·AI 마케팅 소식 — 옵티파이", 76, H - 200);
  } else {
    ctx.fillStyle = INK;
    ctx.font = `bold 58px ${FONT}`;
    let y = 330;
    for (const line of wrapText(ctx, card.title, maxWidth)) {
      ctx.fillText(line, 76, y);
      y += 80;
    }
    y += 24;
    ctx.font = `40px ${FONT}`;
    for (const raw of card.lines) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(76, y - 14, 10, 10); // 불릿
      ctx.fillStyle = "#3d5248";
      const wrapped = wrapText(ctx, raw, maxWidth - 40);
      for (let i = 0; i < wrapped.length; i++) {
        ctx.fillText(wrapped[i], 108, y);
        y += 62;
      }
      y += 14;
    }
  }

  // ── 푸터 ──
  ctx.fillStyle = MUTED;
  ctx.font = `26px ${FONT}`;
  ctx.fillText(`${index + 1} / ${total}`, 76, H - 84);
  ctx.textAlign = "right";
  ctx.fillStyle = DEEP;
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillText("optify.kr", W - 76, H - 84);
  ctx.textAlign = "left";

  return canvas.toDataURL("image/png");
}

export function CardnewsPanel({ reportDate }: { reportDate: string }) {
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<CardState[]>([]);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [msg, setMsg] = useState("");

  async function recompose(list: CardState[]): Promise<CardState[]> {
    const out: CardState[] = [];
    for (let i = 0; i < list.length; i++) {
      out.push({ ...list[i], png: await composeCard(list[i], i, list.length, reportDate) });
    }
    return out;
  }

  async function generateCopy() {
    setBusy("copy");
    setMsg("");
    try {
      const res = await fetch("/api/cardnews/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      setCards(await recompose(d.cards as CardState[]));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "카피 생성 실패");
    } finally {
      setBusy("");
    }
  }

  async function generateBackgrounds() {
    setBusy("images");
    setMsg("");
    try {
      const next = [...cards];
      for (let i = 0; i < next.length; i++) {
        setProgress(`배경 이미지 생성 중… ${i + 1}/${next.length}`);
        const res = await fetch("/api/cardnews/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: next[i].image_prompt }),
        });
        const d = await res.json();
        if (d.ok && d.dataUrl) next[i] = { ...next[i], bg: d.dataUrl };
        else setMsg(`${i + 1}번 카드 배경 실패: ${d.error ?? "알 수 없음"} (템플릿 배경 유지)`);
      }
      setProgress("합성 중…");
      setCards(await recompose(next));
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  function updateCard(i: number, patch: Partial<CardState>) {
    setCards((prev) => prev.map((card, j) => (j === i ? { ...card, ...patch } : card)));
  }

  async function refreshPreview() {
    setBusy("compose");
    try {
      setCards(await recompose(cards));
    } finally {
      setBusy("");
    }
  }

  function download(card: CardState, i: number) {
    if (!card.png) return;
    const a = document.createElement("a");
    a.href = card.png;
    a.download = `cardnews-${reportDate}-${String(i + 1).padStart(2, "0")}.png`;
    a.click();
  }

  async function downloadAll() {
    for (let i = 0; i < cards.length; i++) {
      download(cards[i], i);
      await new Promise((r) => setTimeout(r, 300)); // 브라우저 다중 다운로드 간격
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">🖼️ 카드뉴스 만들기</h2>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-red-500">{msg}</span>}
          {progress && <span className="text-xs text-muted">{progress}</span>}
          {!open ? (
            <button
              onClick={() => {
                setOpen(true);
                if (!cards.length) generateCopy();
              }}
              className="rounded-md border border-accent-deep px-3 py-1.5 text-sm font-medium text-accent-deep hover:bg-tint"
            >
              오늘 리포트로 카드뉴스 생성
            </button>
          ) : (
            <>
              <button
                onClick={generateCopy}
                disabled={!!busy}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-subtle disabled:opacity-50"
              >
                {busy === "copy" ? "카피 생성 중…" : "카피 다시 생성"}
              </button>
              <button
                onClick={generateBackgrounds}
                disabled={!!busy || !cards.length}
                className="rounded-md border border-accent-deep px-3 py-1.5 text-sm font-medium text-accent-deep hover:bg-tint disabled:opacity-50"
              >
                {busy === "images" ? "생성 중…" : `AI 배경 입히기 (${cards.length}장)`}
              </button>
              <button
                onClick={downloadAll}
                disabled={!!busy || !cards.length}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
              >
                전체 다운로드
              </button>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {busy === "copy" && !cards.length ? (
            <p className="py-6 text-center text-sm text-muted">
              리포트를 요약해 카드 카피를 만드는 중…
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((card, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                  {card.png && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.png}
                      alt={`카드 ${i + 1}`}
                      className="w-full rounded-md border border-border"
                    />
                  )}
                  <p className="text-[11px] font-medium text-muted">
                    {i + 1}번 · {card.type === "cover" ? "표지" : card.type === "outro" ? "마무리" : "본문"}
                  </p>
                  <input
                    value={card.title}
                    onChange={(e) => updateCard(i, { title: e.target.value })}
                    className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent-deep"
                  />
                  <textarea
                    value={card.lines.join("\n")}
                    onChange={(e) => updateCard(i, { lines: e.target.value.split("\n") })}
                    rows={3}
                    className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent-deep"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => download(card, i)}
                      disabled={!card.png}
                      className="rounded border border-border px-2 py-1 text-xs hover:bg-subtle disabled:opacity-50"
                    >
                      다운로드
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {cards.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={refreshPreview}
                disabled={!!busy}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-subtle disabled:opacity-50"
              >
                {busy === "compose" ? "합성 중…" : "수정 반영 (미리보기 갱신)"}
              </button>
              <span className="text-xs text-muted">
                텍스트 수정 후 이 버튼을 눌러야 이미지에 반영됩니다. 1080×1080 PNG.
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
