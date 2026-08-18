"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * 월간 플랜 일괄 생성 — 키워드를 풀에 연결(기존 재사용, 없으면 생성)하고
 * 발행 예정일이 배정된 content_plans를 한 번에 만든다.
 * 채널 기본 담당자(channel_settings.default_assignee) 자동 배정.
 */
export async function createBulkPlans(input: {
  clientId: string;
  channel: string;
  items: { keyword: string; title: string; date: string }[];
}): Promise<{ ok: boolean; count: number; error?: string }> {
  const supabase = await createClient();
  if (!input.items.length) return { ok: false, count: 0, error: "생성할 항목이 없습니다." };

  const { data: cs } = await supabase
    .from("channel_settings")
    .select("default_assignee")
    .eq("client_id", input.clientId)
    .eq("channel", input.channel)
    .maybeSingle();

  // 키워드 풀 연결: 기존 키워드 재사용, 없으면 planned로 생성
  const uniqueKeywords = [...new Set(input.items.map((i) => i.keyword.trim()).filter(Boolean))];
  const { data: existing } = await supabase
    .from("keywords")
    .select("id, keyword")
    .eq("client_id", input.clientId)
    .in("keyword", uniqueKeywords);
  const keywordIds = new Map(
    ((existing ?? []) as { id: string; keyword: string }[]).map((k) => [k.keyword, k.id]),
  );

  const missing = uniqueKeywords.filter((k) => !keywordIds.has(k));
  if (missing.length) {
    const { data: inserted, error: kwErr } = await supabase
      .from("keywords")
      .insert(
        missing.map((keyword) => ({
          client_id: input.clientId,
          keyword,
          source: "manual",
          status: "planned",
        })),
      )
      .select("id, keyword");
    if (kwErr) return { ok: false, count: 0, error: kwErr.message };
    for (const k of (inserted ?? []) as { id: string; keyword: string }[]) {
      keywordIds.set(k.keyword, k.id);
    }
  }

  const { error: planErr } = await supabase.from("content_plans").insert(
    input.items.map((item) => ({
      client_id: input.clientId,
      keyword_id: keywordIds.get(item.keyword.trim()) ?? null,
      title: item.title,
      channel: input.channel,
      status: "idea",
      scheduled_date: item.date,
      assignee: cs?.default_assignee ?? null,
    })),
  );
  if (planErr) return { ok: false, count: 0, error: planErr.message };
  return { ok: true, count: input.items.length };
}

/**
 * 엑셀 업로드 일괄 등록 — createBulkPlans와 같은 키워드 연결 로직에
 * 행별 채널·메모·날짜 없음(리스트에만 표시)을 지원한다.
 * 담당자는 각 행의 채널 기본 담당자(channel_settings.default_assignee)를 따른다.
 */
export async function importPlans(input: {
  clientId: string;
  items: {
    title: string;
    channel: string;
    keyword: string | null;
    date: string | null;
    /** 엑셀의 월 검색량 — 키워드 신규 생성 시 avg_monthly_searches로 저장 */
    volume?: number | null;
    memo: string | null;
  }[];
}): Promise<{ ok: boolean; count: number; error?: string }> {
  const supabase = await createClient();
  const items = input.items.filter((i) => i.title.trim() && i.channel);
  if (!items.length) return { ok: false, count: 0, error: "등록할 항목이 없습니다." };

  // 채널별 기본 담당자
  const { data: settings } = await supabase
    .from("channel_settings")
    .select("channel, default_assignee")
    .eq("client_id", input.clientId);
  const assigneeByChannel = new Map(
    ((settings ?? []) as { channel: string; default_assignee: string | null }[]).map((s) => [
      s.channel,
      s.default_assignee,
    ]),
  );

  // 키워드 풀 연결: 기존 재사용, 없으면 planned로 생성
  const uniqueKeywords = [
    ...new Set(items.map((i) => i.keyword?.trim()).filter((k): k is string => !!k)),
  ];
  const keywordIds = new Map<string, string>();
  if (uniqueKeywords.length) {
    const { data: existing } = await supabase
      .from("keywords")
      .select("id, keyword")
      .eq("client_id", input.clientId)
      .in("keyword", uniqueKeywords);
    for (const k of (existing ?? []) as { id: string; keyword: string }[]) {
      keywordIds.set(k.keyword, k.id);
    }
    const missing = uniqueKeywords.filter((k) => !keywordIds.has(k));
    if (missing.length) {
      // 같은 키워드가 여러 행에 있으면 첫 번째 검색량 사용
      const volumeByKeyword = new Map<string, number>();
      for (const i of items) {
        const k = i.keyword?.trim();
        if (k && i.volume != null && !volumeByKeyword.has(k)) {
          volumeByKeyword.set(k, i.volume);
        }
      }
      const { data: inserted, error: kwErr } = await supabase
        .from("keywords")
        .insert(
          missing.map((keyword) => ({
            client_id: input.clientId,
            keyword,
            source: "manual",
            status: "planned",
            avg_monthly_searches: volumeByKeyword.get(keyword) ?? null,
          })),
        )
        .select("id, keyword");
      if (kwErr) return { ok: false, count: 0, error: kwErr.message };
      for (const k of (inserted ?? []) as { id: string; keyword: string }[]) {
        keywordIds.set(k.keyword, k.id);
      }
    }
  }

  const { error: planErr } = await supabase.from("content_plans").insert(
    items.map((item) => ({
      client_id: input.clientId,
      keyword_id: item.keyword ? (keywordIds.get(item.keyword.trim()) ?? null) : null,
      title: item.title.trim(),
      channel: item.channel,
      status: "idea",
      scheduled_date: item.date,
      assignee: assigneeByChannel.get(item.channel) ?? null,
      memo: item.memo,
    })),
  );
  if (planErr) return { ok: false, count: 0, error: planErr.message };
  return { ok: true, count: items.length };
}
