import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generateImage, GEMINI_IMAGE_MODEL } from "@/lib/gemini";
import { safeImageFilename } from "@/lib/generation/html-images";
import { logApiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

const BUCKET = "blog-images";

/**
 * Gemini 이미지 생성 → Supabase Storage(blog-images, public) 저장 → 공개 URL 반환.
 * body: { clientId, prompt }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, prompt, filename, alt } = await req.json();
  if (!prompt?.trim()) {
    return NextResponse.json({ ok: false, error: "prompt 필수" }, { status: 400 });
  }

  // 텍스트 없는 사진풍 안전 접미사 (참고 프로젝트 패턴)
  const safePrompt = `${prompt}. No text, letters, watermarks or logos in the image. Photorealistic, high quality, 16:9.`;

  try {
    const { data, mime } = await generateImage(safePrompt);

    const admin = createAdminClient();
    // 버킷 보장 (idempotent)
    await admin.storage
      .createBucket(BUCKET, { public: true })
      .catch(() => undefined);

    const ext = mime.includes("jpeg") ? "jpg" : "png";
    // SEO 파일명(있으면) 우선, 없으면 UUID. 클라이언트 폴더 하위에 저장.
    const name = filename
      ? safeImageFilename(filename, ext)
      : `${randomUUID()}.${ext}`;
    const path = `${clientId ?? "shared"}/${name}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, data, { contentType: mime, upsert: true });
    if (upErr) throw upErr;

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

    await logApiUsage({
      userId: user.id,
      clientId: clientId ?? null,
      provider: "gemini",
      model: GEMINI_IMAGE_MODEL, // 장당 고정 단가로 비용 추정 [AUDIT M-4]
    });

    return NextResponse.json({
      ok: true,
      url: pub.publicUrl,
      alt: alt ?? "",
      filename: name,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "이미지 생성 실패",
    });
  }
}
