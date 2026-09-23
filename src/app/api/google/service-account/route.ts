import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceAccount } from "@/lib/google/service-account";

export const runtime = "nodejs";

/** 서치콘솔·GA4 에 사용자로 추가해야 하는 서비스 계정 이메일 (비밀값 아님). 팀원만 볼 수 있다. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: me } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!me) return new NextResponse("Forbidden", { status: 403 });
  try {
    return NextResponse.json({ ok: true, email: getServiceAccount().client_email });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "서비스 계정 설정 없음" });
  }
}
