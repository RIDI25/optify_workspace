import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { wpTestConnection } from "@/lib/wordpress";
import { isSafePublicUrl } from "@/lib/url-guard";

export const runtime = "nodejs";

/**
 * WP 연결 테스트.
 * body: { clientId } (저장된 자격증명 사용) 또는 { wpUrl, wpUsername, wpPassword } (즉시 검증).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json();

  let url: string | undefined = body.wpUrl;
  let username: string | undefined = body.wpUsername;
  let password: string | undefined = body.wpPassword;

  if (!password && body.clientId) {
    const { data } = await supabase
      .from("channel_settings")
      .select("wp_url, wp_username, wp_app_password_encrypted")
      .eq("client_id", body.clientId)
      .eq("channel", "wordpress")
      .single();
    if (!data?.wp_app_password_encrypted) {
      return NextResponse.json({ ok: false, error: "저장된 WP 연결 정보가 없습니다." });
    }
    url = data.wp_url ?? undefined;
    username = data.wp_username ?? undefined;
    password = decryptSecret(data.wp_app_password_encrypted);
  }

  if (!url || !username || !password) {
    return NextResponse.json({ ok: false, error: "url/username/password 필요" });
  }

  // SSRF 완화: http(s)만, 사설/내부 주소 차단 [AUDIT L-2]
  const guard = isSafePublicUrl(url);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error });
  }

  const result = await wpTestConnection(url, username, password);
  return NextResponse.json(result);
}
