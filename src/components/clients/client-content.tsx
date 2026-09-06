"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PlansView } from "@/components/plans/plans-view";
import { GenerateView } from "@/components/generate/generate-view";
import { LibraryView } from "@/components/library/library-view";
import { KeywordsView } from "@/components/keywords/keywords-view";
import { ContentWorkList } from "@/components/clients/content-work-list";
import { parseClientPath } from "@/lib/nav";

type View = "work" | "plans" | "generate" | "library" | "keywords";
const VIEWS: { key: View; label: string; hint: string }[] = [
  { key: "work", label: "작업 목록", hint: "다섯 상태 · 다음 행동" },
  { key: "plans", label: "플랜 · 일정", hint: "기획 → 예정일 → 외부 글 등록" },
  { key: "generate", label: "글 만들기", hint: "AI 생성 → 수정 → 완료 처리" },
  { key: "library", label: "라이브러리 · 검수", hint: "승인 · 발행 기록" },
  { key: "keywords", label: "키워드 리서치", hint: "도구 — 주제 발굴" },
];

/**
 * 고객사 카드 › 콘텐츠. 기존 네 화면(플랜·생성·라이브러리·키워드)을 한 탭 안의 보기로 잇는다.
 * (2차) '작업 목록'이 기본 — 다섯 상태와 다음 행동. 나머지는 도구 보기.
 */
export function ClientContent() {
  const params = useSearchParams();
  const pathname = usePathname();
  const raw = params.get("view");
  const view: View = VIEWS.some((v) => v.key === raw) ? (raw as View) : "work";
  const clientId = parseClientPath(pathname)?.clientId ?? "";

  const hrefFor = (key: View) => {
    const q = new URLSearchParams(params.toString());
    q.set("view", key);
    // 다른 보기로 옮길 땐 그 보기의 깊은 링크만 남긴다
    if (key !== "generate") ["planId", "channel", "title", "keyword"].forEach((k) => q.delete(k));
    if (key !== "library") ["contentId", "approval"].forEach((k) => q.delete(k));
    return `${pathname}?${q.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-subtle p-1">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={hrefFor(v.key)}
            title={v.hint}
            className={[
              "rounded-md px-3 py-1.5 text-sm",
              view === v.key ? "bg-surface font-semibold text-accent-deep shadow-sm" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            {v.label}
          </Link>
        ))}
      </div>
      {view === "work" && clientId && <ContentWorkList clientId={clientId} />}
      {view === "plans" && <PlansView />}
      {view === "generate" && <GenerateView />}
      {view === "library" && <LibraryView />}
      {view === "keywords" && <KeywordsView />}
    </div>
  );
}
