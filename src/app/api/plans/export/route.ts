import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { channelLabel } from "@/lib/channels";
import { renderPlanSchedulePdf, type PlanScheduleRow } from "@/lib/export/plan-schedule-pdf";
import type { ContentPlan } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 고객 제출용 콘텐츠 발행 계획서 PDF — 기간 내 예정 플랜을 표로 출력, 즉시 다운로드.
 * body: { clientId, clientName, start, end }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { clientId, clientName, start, end } = (await req.json()) as {
    clientId?: string;
    clientName?: string;
    start?: string;
    end?: string;
  };
  if (!clientId || !start || !end) {
    return NextResponse.json({ ok: false, error: "clientId, start, end 필요" }, { status: 400 });
  }

  try {
    const [plansRes, kwRes] = await Promise.all([
      supabase
        .from("content_plans")
        .select("*")
        .eq("client_id", clientId)
        .gte("scheduled_date", start)
        .lte("scheduled_date", end)
        .order("scheduled_date", { ascending: true }),
      supabase.from("keywords").select("id, keyword").eq("client_id", clientId),
    ]);
    const plans = (plansRes.data ?? []) as ContentPlan[];
    if (!plans.length) {
      return NextResponse.json(
        { ok: false, error: "해당 기간에 발행 예정 플랜이 없습니다." },
        { status: 400 },
      );
    }
    const kwMap = new Map(
      ((kwRes.data ?? []) as { id: string; keyword: string }[]).map((k) => [k.id, k.keyword]),
    );

    const rows: PlanScheduleRow[] = plans.map((p) => ({
      date: p.scheduled_date!,
      weekday: WEEKDAYS[new Date(`${p.scheduled_date}T00:00:00`).getDay()],
      channelLabel: channelLabel(p.channel),
      title: p.title,
      keyword: p.keyword_id ? (kwMap.get(p.keyword_id) ?? null) : null,
    }));

    const byChannelMap = new Map<string, number>();
    for (const row of rows) {
      byChannelMap.set(row.channelLabel, (byChannelMap.get(row.channelLabel) ?? 0) + 1);
    }
    const byChannel = [...byChannelMap.entries()].map(([label, count]) => ({ label, count }));

    const buffer = await renderPlanSchedulePdf({
      clientName: clientName ?? "",
      start,
      end,
      rows,
      byChannel,
    });

    const filename = encodeURIComponent(`콘텐츠발행계획서_${clientName ?? ""}_${start}.pdf`);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "계획서 생성 실패",
    });
  }
}
