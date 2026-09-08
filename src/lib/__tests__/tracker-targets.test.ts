import { describe, expect, it } from "vitest";
import { cleanTargets, parseLines, toDraft } from "@/lib/tracker-targets";

describe("tracker-targets", () => {
  it("parseLines: 공백·빈 줄·중복(띄어쓰기 무시) 정리", () => {
    expect(parseLines(" 부산 마케팅 \n\n부산마케팅\n병원 마케팅 ")).toEqual(["부산 마케팅", "병원 마케팅"]);
  });

  it("cleanTargets: 메인에 있는 건 서브에서 빼고, 질문 의도는 허용값만", () => {
    const r = cleanTargets({
      main: "부산 마케팅\n병원 마케팅",
      sub: "부산마케팅\n한의원 마케팅",
      questions: [
        { text: " 부산 한의원 추천 ", intent: "지역형" },
        { text: "부산한의원추천", intent: "정보형" },
        { text: "옵티파이 후기", intent: "이상한값" },
        { text: "  ", intent: null },
      ],
    });
    expect(r.errors).toEqual([]);
    expect(r.main_keywords).toEqual(["부산 마케팅", "병원 마케팅"]);
    expect(r.sub_keywords).toEqual(["한의원 마케팅"]);
    expect(r.questions).toEqual([
      { text: "부산 한의원 추천", intent: "지역형" },
      { text: "옵티파이 후기", intent: null },
    ]);
  });

  it("cleanTargets: 한도 초과·빈 입력은 오류", () => {
    const many = Array.from({ length: 6 }, (_, i) => `키워드 ${i}`).join("\n");
    expect(cleanTargets({ main: many, sub: "", questions: [] }).errors[0]).toMatch(/메인 키워드는 5개까지/);
    const q = Array.from({ length: 21 }, (_, i) => ({ text: `질문 ${i}`, intent: null }));
    expect(cleanTargets({ main: "", sub: "", questions: q }).errors[0]).toMatch(/질문은 20개까지/);
    expect(cleanTargets({ main: "", sub: "", questions: [] }).errors[0]).toMatch(/하나 이상/);
  });

  it("toDraft: 저장된 행을 화면 초안으로", () => {
    expect(toDraft({ main_keywords: ["a", "b"], sub_keywords: [], questions: [{ text: "q", intent: null }] })).toEqual({ main: "a\nb", sub: "", questions: [{ text: "q", intent: null }] });
    expect(toDraft(null)).toEqual({ main: "", sub: "", questions: [] });
  });
});
