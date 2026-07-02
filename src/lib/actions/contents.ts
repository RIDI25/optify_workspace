"use server";

import { createClient } from "@/lib/supabase/server";

/** 이미지 삽입이 끝난 최종 HTML과 이미지 URL 배열을 콘텐츠에 반영 */
export async function finalizeContentHtml(
  contentId: string,
  finalHtml: string,
  imageUrls: string[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contents")
    .update({ body: finalHtml, images: imageUrls })
    .eq("id", contentId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
