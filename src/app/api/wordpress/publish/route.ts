import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { wpCreateDraft } from "@/lib/wordpress";
import { markdownToBasicHtml } from "@/lib/text";

export const runtime = "nodejs";

/**
 * WP 초안 발행.
 * body: { clientId, title, body(markdown), contentId? }
 * 성공 시 wp_post_id를 contents에 저장.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, title, body, contentId } = await req.json();
  if (!clientId || !body?.trim()) {
    return NextResponse.json(
      { ok: false, error: "clientId, body는 필수입니다." },
      { status: 400 },
    );
  }

  const { data: settings } = await supabase
    .from("channel_settings")
    .select("wp_url, wp_username, wp_app_password_encrypted")
    .eq("client_id", clientId)
    .eq("channel", "wordpress")
    .single();

  if (!settings?.wp_app_password_encrypted || !settings.wp_url) {
    return NextResponse.json({
      ok: false,
      error: "WP 연결 정보가 없습니다. 설정에서 워드프레스 연결 정보를 입력하세요.",
    });
  }

  try {
    const password = decryptSecret(settings.wp_app_password_encrypted);
    const { id } = await wpCreateDraft(
      settings.wp_url,
      settings.wp_username ?? "",
      password,
      title || "(제목 없음)",
      markdownToBasicHtml(body),
    );

    if (contentId) {
      await supabase.from("contents").update({ wp_post_id: id }).eq("id", contentId);
    }

    return NextResponse.json({ ok: true, wpPostId: id });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "발행 실패",
    });
  }
}
