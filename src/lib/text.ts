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
