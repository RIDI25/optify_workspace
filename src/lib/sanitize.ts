"use client";

import DOMPurify from "dompurify";

/**
 * 저장된/생성된 HTML 을 화면에 그릴 때 거치는 정화. 브라우저에서만 동작한다 (서버 렌더에서는 빈 문자열).
 * 스크립트·iframe·이벤트 속성·javascript: 링크를 제거하고 본문 서식(제목·문단·목록·링크·이미지·표)만 남긴다.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined" || !html) return "";
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input", "button", "svg", "math"],
    FORBID_ATTR: ["style", "srcset", "formaction"],
  });
}
