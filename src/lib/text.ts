function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * 워드프레스 초안용 최소 마크다운 → HTML 변환.
 * 헤딩(H2/H3), 이미지, 볼드, 링크, 문단만 처리. 사용자가 WP에서 최종 편집한다는 전제의 초안 품질.
 */
export function markdownToBasicHtml(md: string): string {
  const blocks = md.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const t = block.trim();
      if (!t) return "";
      const img = t.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (img) return `<figure><img src="${img[2]}" alt="${escapeHtml(img[1])}" /></figure>`;
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
