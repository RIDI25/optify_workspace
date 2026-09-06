import { describe, expect, it } from "vitest";
import { markdownToBasicHtml, safeHref, stripMarkdown } from "@/lib/text";

describe("markdownToBasicHtml", () => {
  it("이미지 alt·src 의 따옴표와 이벤트 속성을 이스케이프한다", () => {
    const html = markdownToBasicHtml('![a" onerror="alert(1)](https://x.com/a.png)');
    expect(html).not.toContain('onerror="');
    expect(html).toContain("&quot;");
    expect(html).toContain('src="https://x.com/a.png"');
  });
  it("javascript: 링크·이미지는 속성으로 들어가지 않는다", () => {
    for (const md of ["[클릭](javascript:alert(1))", "[클릭](javascript:void(0))", "![x](javascript:alert(1))", "![x](data:text/html,x)"]) {
      const html = markdownToBasicHtml(md);
      expect(html, md).not.toMatch(/<a |<img /);
      expect(html, md).not.toMatch(/(href|src)=/);
    }
    expect(markdownToBasicHtml("[클릭](javascript:alert)")).toBe("<p>클릭</p>");
  });
  it("정상 링크·헤딩·볼드는 변환한다", () => {
    const html = markdownToBasicHtml("## 제목\n\n본문 **강조** [링크](https://optify.kr/)");
    expect(html).toContain("<h2>제목</h2>");
    expect(html).toContain("<strong>강조</strong>");
    expect(html).toContain('<a href="https://optify.kr/">링크</a>');
  });
  it("꺾쇠는 태그로 해석되지 않는다", () => {
    expect(markdownToBasicHtml("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });
});

describe("safeHref", () => {
  it("http(s)·사이트 안 경로·앵커만 통과", () => {
    expect(safeHref("https://optify.kr/a")).toBe("https://optify.kr/a");
    expect(safeHref("/guide")).toBe("/guide");
    expect(safeHref("#top")).toBe("#top");
    expect(safeHref("javascript:void(0)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
  });
});

describe("stripMarkdown", () => {
  it("서식을 지우고 텍스트만 남긴다", () => {
    expect(stripMarkdown("## 제목\n**굵게** [링크](https://a.b)")).toBe("제목\n굵게 링크");
  });
});
