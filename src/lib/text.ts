function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 링크·이미지에 넣어도 되는 주소만 통과 (http(s) 절대 주소, 사이트 안 경로, 앵커).
 * javascript:, data: 같은 스킴은 버린다. 속성값에 들어가므로 따옴표·꺾쇠는 이스케이프한다.
 */
export function safeHref(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  if (/^(https?:)?\/\//i.test(u) || /^\/(?!\/)/.test(u) || /^#/.test(u)) return escapeHtml(u);
  return null;
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, url: string) => {
      // escapeHtml 을 이미 거친 문자열이라 &quot; 등이 들어 있을 수 있다 → 원문으로 되돌려 검사
      const href = safeHref(unescapeHtml(url));
      return href ? `<a href="${href}">${text}</a>` : text;
    });
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * 워드프레스 초안용 최소 마크다운 → HTML 변환.
 * 헤딩(H2/H3), 이미지, 볼드, 링크, 문단만 처리. 사용자가 WP에서 최종 편집한다는 전제의 초안 품질.
 * 속성값은 모두 이스케이프하고, 안전하지 않은 주소의 이미지는 텍스트로 남긴다.
 */
export function markdownToBasicHtml(md: string): string {
  const blocks = md.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const t = block.trim();
      if (!t) return "";
      const img = t.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (img) {
        const src = safeHref(img[2]);
        return src
          ? `<figure><img src="${src}" alt="${escapeHtml(img[1])}" /></figure>`
          : `<p>${escapeHtml(img[1] || img[2])}</p>`;
      }
      if (t.startsWith("### ")) return `<h3>${inline(t.slice(4))}</h3>`;
      if (t.startsWith("## ")) return `<h2>${inline(t.slice(3))}</h2>`;
      if (t.startsWith("# ")) return `<h2>${inline(t.slice(2))}</h2>`;
      const html = t
        .split("\n")
        .map((line) => inline(line))
        .join("<br />");
      return `<p>${html}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}

/** 마크다운 서식을 제거해 네이버/스레드 붙여넣기용 플레인 텍스트로 변환 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "") // 헤딩 기호
    .replace(/\*\*(.*?)\*\*/g, "$1") // 볼드
    .replace(/\*(.*?)\*/g, "$1") // 이탤릭
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // 코드
    .replace(/^\s*[-*+]\s+/gm, "") // 불릿
    .replace(/^\s*>\s?/gm, "") // 인용
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // 링크 → 텍스트만
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
