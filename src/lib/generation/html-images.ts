export interface PlacedImage {
  url: string;
  alt: string;
  /** 키워드 기반 한국어 이미지 제목 — img title 속성으로 삽입 */
  title?: string;
}

/**
 * 생성된 이미지를 워드프레스 본문 HTML에 삽입.
 * - 첫 이미지: 썸네일로 본문 맨 앞 <figure>
 * - 나머지: h2 섹션에 균등 분배 (h2 개수/이미지 수 간격)
 * (참고 프로젝트의 균등 배치 로직을 우리 구조로 재구현)
 */
export function assembleHtmlWithImages(
  contentHtml: string,
  images: PlacedImage[],
): string {
  if (images.length === 0) return contentHtml;

  const esc = (s: string) => s.replace(/"/g, "&quot;");
  const figure = (img: PlacedImage) =>
    `<figure class="wp-block-image size-large"><img src="${img.url}" alt="${esc(img.alt)}"${img.title ? ` title="${esc(img.title)}"` : ""} /></figure>`;

  let html = contentHtml;
  const bodyImages = images.slice(1);

  if (bodyImages.length > 0) {
    const h2Count = (html.match(/<\/h2>/g) ?? []).length;
    const targets = new Set<number>();
    if (h2Count > 0) {
      const step = h2Count / bodyImages.length;
      for (let i = 0; i < bodyImages.length; i++) {
        targets.add(Math.round(i * step));
      }
    }
    let h2Idx = 0;
    let imgIdx = 0;
    html = html.replace(/<\/h2>/g, (match) => {
      const current = h2Idx++;
      if (targets.has(current) && imgIdx < bodyImages.length) {
        return `${match}\n${figure(bodyImages[imgIdx++])}`;
      }
      return match;
    });
    // h2가 없어 배치 못한 이미지는 말미에 추가
    while (imgIdx < bodyImages.length) {
      html += `\n${figure(bodyImages[imgIdx++])}`;
    }
  }

  // 썸네일을 맨 앞에
  return `${figure(images[0])}\n${html}`;
}

/** 파일명 안전화: 영소문자/숫자/하이픈/점/언더스코어만 허용, 경로 탈출 방지 */
export function safeImageFilename(name: string, fallbackExt = "png"): string {
  const base = (name || "").split("/").pop() ?? "";
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned || cleaned === "." || cleaned === "..") {
    return `image.${fallbackExt}`;
  }
  return /\.[a-z0-9]+$/.test(cleaned) ? cleaned : `${cleaned}.${fallbackExt}`;
}
