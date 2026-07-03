/** 서버 사이드 fetch용 URL 검증 (SSRF 완화) [AUDIT L-2] */

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

const PRIVATE_HOST =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?fc00:|\[?fd|\[?fe80:)/i;

/** http(s) 스킴 + 사설/루프백 IP·localhost 차단 (외부 임의 URL 접속 방지) */
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
  if (PRIVATE_HOST.test(u.hostname)) {
    return { ok: false, error: "사설/내부 주소는 허용되지 않습니다." };
  }
  return { ok: true };
}
