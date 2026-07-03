import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { wpCreateDraft, wpUploadMedia } from "@/lib/wordpress";
import { markdownToBasicHtml } from "@/lib/text";
import { isSupabaseStorageUrl } from "@/lib/url-guard";

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

  const { clientId, title, body, contentHtml, contentId, featuredImage } =
    await req.json();
  // contentHtml(이미 HTML)이 오면 그대로, 아니면 body(markdown)를 변환
  const hasHtml = typeof contentHtml === "string" && contentHtml.trim();
  if (!clientId || (!hasHtml && !body?.trim())) {
    return NextResponse.json(
      { ok: false, error: "clientId와 본문은 필수입니다." },
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
    const wpUrl = settings.wp_url;
    const wpUser = settings.wp_username ?? "";

    // 첫 이미지를 WP 미디어로 업로드 → featured_media 지정
    let featuredMediaId: number | undefined;
    let thumbnailSet = false;
    let thumbnailError: string | undefined;
    if (featuredImage?.url && !isSupabaseStorageUrl(featuredImage.url)) {
      // 자사 Storage 이미지만 허용 [AUDIT L-2]
      thumbnailError = "허용되지 않은 이미지 호스트(자사 Storage만 가능)";
    } else if (featuredImage?.url) {
      try {
        const imgRes = await fetch(featuredImage.url);
        if (!imgRes.ok) throw new Error(`이미지 다운로드 실패 (${imgRes.status})`);
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const mime = imgRes.headers.get("content-type") || "image/png";
        const media = await wpUploadMedia(
          wpUrl,
          wpUser,
          password,
          buf,
          featuredImage.filename || "thumbnail.png",
          mime,
          featuredImage.alt || "",
        );
        featuredMediaId = media.id;
        thumbnailSet = true;
      } catch (e) {
        thumbnailError = e instanceof Error ? e.message : "썸네일 업로드 실패";
      }
    }

    const { id } = await wpCreateDraft(
      wpUrl,
      wpUser,
      password,
      title || "(제목 없음)",
      hasHtml ? contentHtml : markdownToBasicHtml(body),
      featuredMediaId,
    );

    if (contentId) {
      await supabase.from("contents").update({ wp_post_id: id }).eq("id", contentId);
    }

    return NextResponse.json({ ok: true, wpPostId: id, thumbnailSet, thumbnailError });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "발행 실패",
    });
  }
}
