import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generateImage } from "@/lib/gemini";
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

  const { clientId, prompt } = await req.json();
  if (!prompt?.trim()) {
    return NextResponse.json({ ok: false, error: "prompt 필수" }, { status: 400 });
  }

  try {
    const { data, mime } = await generateImage(prompt);

    const admin = createAdminClient();
    // 버킷 보장 (idempotent)
    await admin.storage
      .createBucket(BUCKET, { public: true })
      .catch(() => undefined);

    const ext = mime.includes("jpeg") ? "jpg" : "png";
    const path = `${clientId ?? "shared"}/${randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, data, { contentType: mime, upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

    await logApiUsage({
      userId: user.id,
      clientId: clientId ?? null,
      provider: "gemini",
    });

    return NextResponse.json({ ok: true, url: pub.publicUrl });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "이미지 생성 실패",
    });
  }
}
