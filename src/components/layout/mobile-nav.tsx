"use client";

import { useState } from "react";
import { NavList } from "@/components/layout/sidebar";
import type { Role } from "@/types/database";

/** 모바일 전용: 햄버거 버튼 + 좌측 슬라이드 드로어 (md 이상에서는 숨김) */
export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-ink hover:bg-subtle"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-xl">
            <div className="flex h-16 shrink-0 items-center justify-between px-5">
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full bg-accent" aria-hidden />
                <span className="text-base font-bold tracking-tight text-ink">
                  옵티파이 워크스페이스
                </span>
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="메뉴 닫기"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-subtle"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <NavList role={role} onNavigate={() => setOpen(false)} />
            <div className="border-t border-border px-5 py-3 text-xs text-muted">
              {role === "owner" ? "관리자(owner)" : "멤버(member)"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
