import { describe, expect, it } from "vitest";
import { isPrivateAddress, isSafePublicUrl } from "@/lib/url-guard";

describe("isSafePublicUrl", () => {
  it("공개 주소는 통과", () => {
    expect(isSafePublicUrl("https://optify.kr/").ok).toBe(true);
    expect(isSafePublicUrl("http://8.8.8.8/").ok).toBe(true);
  });
  it("사설·루프백·IPv6 매핑 주소는 차단", () => {
    for (const u of [
      "http://127.0.0.1/",
      "http://10.1.2.3/",
      "http://172.20.0.1/",
      "http://192.168.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:7f00:1]/",
      "http://[fd00::1]/",
      "http://localhost:3000/",
      "http://api.internal/",
    ]) {
      expect(isSafePublicUrl(u).ok, u).toBe(false);
    }
  });
  it("http(s) 외 스킴과 계정 정보가 든 주소는 차단", () => {
    expect(isSafePublicUrl("ftp://optify.kr/").ok).toBe(false);
    expect(isSafePublicUrl("https://user:pw@optify.kr/").ok).toBe(false);
  });
});

describe("isPrivateAddress", () => {
  it("IP 리터럴만 판단한다", () => {
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
    expect(isPrivateAddress("optify.kr")).toBe(false);
  });
});
