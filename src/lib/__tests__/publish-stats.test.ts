import { describe, expect, it } from "vitest";
import { isPublished, kstMonth, monthBoundsUtc, monthContentSummary } from "@/lib/publish-stats";

const row = (o: { channel?: string; wp?: number | null; pub?: string | null; created: string }) => ({
  channel: o.channel ?? "wordpress",
  wp_post_id: o.wp ?? null,
  published_at: o.pub ?? null,
  created_at: o.created,
});

describe("발행 집계", () => {
  it("WP 초안만 보낸 글은 발행이 아니다", () => {
    expect(isPublished(row({ wp: 12, created: "2026-09-01T00:00:00Z" }))).toBe(false);
    expect(isPublished(row({ pub: "2026-09-02T00:00:00Z", created: "2026-09-01T00:00:00Z" }))).toBe(true);
  });
  it("8월 생성·9월 발행은 9월 실적", () => {
    const rows = [
      row({ created: "2026-08-25T03:00:00Z", pub: "2026-09-03T03:00:00Z" }),
      row({ created: "2026-09-10T03:00:00Z", wp: 5 }),
      row({ channel: "naver_blog", created: "2026-09-11T03:00:00Z", pub: "2026-09-11T05:00:00Z" }),
    ];
    const s = monthContentSummary(rows, "2026-09");
    expect(s.total).toBe(2);
    expect(s.published).toBe(2);
    expect(s.wpDrafts).toBe(1);
    expect(s.byChannel).toEqual({ wordpress: 1, naver_blog: 1 });
    expect(s.publishedByChannel).toEqual({ wordpress: 1, naver_blog: 1 });
    const aug = monthContentSummary(rows, "2026-08");
    expect(aug.total).toBe(1);
    expect(aug.published).toBe(0);
  });
  it("월 귀속은 한국 시간 기준", () => {
    expect(kstMonth("2026-08-31T16:00:00Z")).toBe("2026-09"); // KST 9/1 01:00
    expect(kstMonth("2026-08-31T14:59:59Z")).toBe("2026-08");
    const b = monthBoundsUtc("2026-09");
    expect(b.startIso).toBe("2026-08-31T15:00:00.000Z");
    expect(b.endIso.startsWith("2026-09-30T14:59:59")).toBe(true);
  });
});
