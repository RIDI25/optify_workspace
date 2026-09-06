/** 서버 사이드 fetch용 URL 검증 (SSRF 완화) [AUDIT L-2, 2026-09-06 코덱스 검토 보강] */

import { isIP } from "node:net";

/** 자사 Supabase Storage에서 온 URL인지 (featuredImage 업로드용 allowlist) */
export function isSupabaseStorageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    return (
      u.protocol === "https:" &&
      u.host === base.host &&
      u.pathname.startsWith("/storage/")
    );
  } catch {
    return false;
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // 해석 불가 → 막는다
  const inRange = (base: string, bits: number) => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) >>> 0 === (b & mask) >>> 0;
  };
  return (
    inRange("0.0.0.0", 8) ||
    inRange("10.0.0.0", 8) ||
    inRange("100.64.0.0", 10) ||
    inRange("127.0.0.0", 8) ||
    inRange("169.254.0.0", 16) ||
    inRange("172.16.0.0", 12) ||
    inRange("192.0.0.0", 24) ||
    inRange("192.168.0.0", 16) ||
    inRange("198.18.0.0", 15) ||
    inRange("224.0.0.0", 3)
  );
}

/** IPv6: 루프백·링크로컬·고유로컬·IPv4 매핑(::ffff:a.b.c.d)까지 검사 */
function isPrivateIpv6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::" || s === "::1") return true;
  const mapped = s.match(/^(?:0*:)*ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? s.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/);
  if (mapped) {
    if (mapped[2]) {
      const hi = parseInt(mapped[1], 16);
      const lo = parseInt(mapped[2], 16);
      return isPrivateIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return isPrivateIpv4(mapped[1]);
  }
  return /^(fc|fd)/.test(s) || /^fe[89ab]/.test(s) || /^64:ff9b:/.test(s);
}

/** IP 리터럴이 사설·루프백·특수 대역인지 */
export function isPrivateAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "");
  const kind = isIP(bare);
  if (kind === 4) return isPrivateIpv4(bare);
  if (kind === 6) return isPrivateIpv6(bare);
  return false; // IP 가 아니면(호스트명) 여기서는 판단하지 않는다
}

const BLOCKED_HOSTS = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

/** http(s) 스킴 + 사설/루프백 IP·localhost 차단 (외부 임의 URL 접속 방지). 호스트명의 DNS 결과는 보지 않는다. */
export function isSafePublicUrl(url: string): { ok: boolean; error?: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, error: "URL 형식이 올바르지 않습니다." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "http(s) URL만 허용됩니다." };
  }
  if (u.username || u.password) {
    return { ok: false, error: "주소에 계정 정보를 넣을 수 없습니다." };
  }
  const host = u.hostname;
  if (BLOCKED_HOSTS.test(host) || isPrivateAddress(host)) {
    return { ok: false, error: "사설/내부 주소는 허용되지 않습니다." };
  }
  return { ok: true };
}

/** 호스트명을 DNS 로 풀어 실제 접속 주소까지 검사 (서버 전용, 최초 요청과 리다이렉트 목적지 모두에 쓴다) */
export async function isSafePublicUrlResolved(url: string): Promise<{ ok: boolean; error?: string }> {
  const basic = isSafePublicUrl(url);
  if (!basic.ok) return basic;
  const host = new URL(url).hostname;
  if (isIP(host.replace(/^\[|\]$/g, ""))) return basic;
  try {
    const { lookup } = await import("node:dns/promises");
    const addrs = await lookup(host, { all: true, verbatim: true });
    if (addrs.length === 0) return { ok: false, error: "주소를 찾을 수 없습니다." };
    if (addrs.some((a) => isPrivateAddress(a.address))) {
      return { ok: false, error: "내부 주소로 연결되는 호스트는 허용되지 않습니다." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "주소를 찾을 수 없습니다." };
  }
}

/**
 * 리다이렉트를 한 단계씩 따라가며 목적지마다 검사하는 fetch (서버 전용).
 * 자동 추적(redirect: follow)은 내부 주소로 튕겨도 모르기 때문에 쓰지 않는다.
 */
export async function safeFetch(url: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const guard = await isSafePublicUrlResolved(current);
    if (!guard.ok) throw new Error(guard.error);
    const res = await fetch(current, { ...init, redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("리다이렉트가 너무 많습니다.");
}
