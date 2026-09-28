import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPeecSummary, findProject, type PeecSummary } from "@/lib/peec";

export const runtime = "nodejs";
export const maxDuration = 60;

// 같은 고객사·기간을 10분 안에 다시 부르면 저장해 둔 값을 준다 (Peec 한도 200회/분)
const cache = new Map<string, { at: number; data: PeecSummary }>();

/** GEO 탭 — Peec AI 결과. GET ?clientId=&days=7|14|30[&refresh=1] */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const key = process.env.PEEC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "PEEC_API_KEY 가 설정되지 않았습니다 (Vercel 환경 변수)" }, { status: 500 });
  const clientId = req.nextUrl.searchParams.get("clientId");
  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 7) || 7));
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId 필요" }, { status: 400 });

  const { data: client } = await supabase.from("clients").select("id, name, website_url").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ ok: false, error: "고객사를 찾을 수 없습니다" }, { status: 404 });

  const kst = new Date(Date.now() + 9 * 3_600_000);
  const end = kst.toISOString().slice(0, 10);
  const start = new Date(kst.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const ck = `${clientId}|${start}|${end}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 10 * 60_000 && !req.nextUrl.searchParams.get("refresh")) return NextResponse.json({ ok: true, summary: hit.data, cached: true });

  try {
    const project = await findProject(key, client as { name: string; website_url?: string | null });
    if (!project) return NextResponse.json({ ok: false, notLinked: true, error: `Peec 에 '${client.name}' 프로젝트가 없습니다. Peec 에서 프로젝트를 만들고 우리 브랜드 도메인을 홈페이지 주소와 같게 넣으면 자동으로 연결됩니다.` });
    const summary = await fetchPeecSummary(key, project, start, end);
    cache.set(ck, { at: Date.now(), data: summary });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Peec 조회 실패" }, { status: 502 });
  }
}
