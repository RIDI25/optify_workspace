/**
 * Peec AI 연동 (서버 전용) — GEO 결과 소스 (2026-09-28).
 * 맥 트래커의 직접 측정(브라우저·LLM API)은 구글 차단이 잦아 끄고, Peec 가 매일 재는 값을 API 로 가져온다.
 * 트래커 tracker/peec.py 와 같은 계산(비율은 Peec 공식 공식: sum(count)/sum(total)).
 * 키: PEEC_API_KEY (회사 범위 → 요청마다 project_id). 고객사↔프로젝트: 우리 브랜드 도메인 ↔ clients.website_url, 없으면 이름.
 */
const BASE = "https://api.peec.ai/customer/v1";

type Row = Record<string, unknown> & {
  brand: { id: string; name?: string };
  model_channel?: { id: string };
  prompt?: { id: string };
  date?: string;
  visibility_count?: number;
  visibility_total?: number;
  mention_count?: number;
  position_sum?: number;
  position_count?: number;
  sentiment_sum?: number;
  sentiment_count?: number;
};
interface Brand { id: string; name: string; domains?: string[] | null; is_own?: boolean }
interface Channel { id: string; description: string; is_active?: boolean }
interface Prompt { id: string; messages?: { content?: string }[]; topic?: { id: string } | null; is_archived?: boolean }
interface Domain { domain: string; classification?: string | null; citation_count?: number; retrieved_percentage?: number }

export interface PeecSummary {
  project: { id: string; name: string };
  period: { start: string; end: string };
  chatCount: number | null;
  total: Metrics;
  channels: (Metrics & { channel: string; name: string })[];
  shareOfVoice: { brand: string; own: boolean; mentions: number; share: number | null }[];
  prompts: { id: string; text: string; topic: string; cells: Record<string, number | null>; visibility: number | null; position: number | null }[];
  trend: { date: string; visibility: number | null; mentions: number }[];
  topDomains: { domain: string; classification: string | null; citations: number; own: boolean }[];
  ownDomainRank: number | null;
  domainsTotal: number;
  fetchedAt: string;
}
export interface Metrics { visibility: number | null; answers: number; visible: number; mentions: number; position: number | null; sentiment: number | null }

async function call<T>(key: string, method: "GET" | "POST", path: string, params: Record<string, string | number> = {}, body?: unknown): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${BASE}${path}${qs.size ? `?${qs}` : ""}`, {
      method,
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, Math.min(Number(res.headers.get("X-RateLimit-Reset") ?? 2) * 1000, 20000)));
      continue;
    }
    if (!res.ok) throw new Error(`Peec ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }
  throw new Error("Peec 요청 한도(429)가 계속됩니다. 잠시 뒤 다시 시도하세요.");
}

const host = (d: string) => d.toLowerCase().trim().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
const ratio = (rows: Row[], n: keyof Row, d: keyof Row) => {
  const a = rows.reduce((s, r) => s + (Number(r[n]) || 0), 0);
  const b = rows.reduce((s, r) => s + (Number(r[d]) || 0), 0);
  return b ? a / b : null;
};
const sentiment = (rows: Row[]) => {
  const s = rows.reduce((x, r) => x + (r.sentiment_sum ?? 0), 0);
  const c = rows.reduce((x, r) => x + (r.sentiment_count ?? 0), 0);
  return c ? (s / c / 2 + 0.5) * 100 : null;
};
const metrics = (rows: Row[]): Metrics => ({
  visibility: ratio(rows, "visibility_count", "visibility_total"),
  answers: rows.reduce((s, r) => s + (r.visibility_total ?? 0), 0),
  visible: rows.reduce((s, r) => s + (r.visibility_count ?? 0), 0),
  mentions: rows.reduce((s, r) => s + (r.mention_count ?? 0), 0),
  position: ratio(rows, "position_sum", "position_count"),
  sentiment: sentiment(rows),
});

export async function findProject(key: string, client: { name: string; website_url?: string | null }) {
  const { data: projects } = await call<{ data: { id: string; name: string }[] }>(key, "GET", "/projects");
  const own = client.website_url ? host(client.website_url) : null;
  if (own) {
    for (const p of projects) {
      const { data: brands } = await call<{ data: Brand[] }>(key, "GET", "/brands", { project_id: p.id });
      if (brands.some((b) => b.is_own && (b.domains ?? []).some((d) => host(d) === own))) return p;
    }
  }
  const n = client.name.trim().toLowerCase();
  return projects.find((p) => p.name.trim().toLowerCase() === n) ?? null;
}

export async function fetchPeecSummary(key: string, project: { id: string; name: string }, start: string, end: string): Promise<PeecSummary> {
  const pid = project.id;
  const report = async (kind: string, dimensions: string[]) => {
    const out: Row[] = [];
    for (let offset = 0; ; offset += 10000) {
      const { data } = await call<{ data: Row[] }>(key, "POST", `/reports/${kind}`, {}, { project_id: pid, start_date: start, end_date: end, dimensions, limit: 10000, offset });
      out.push(...data);
      if (data.length < 10000) return out;
    }
  };
  const [ch, br, pr, tp, byCh, byPr, byDay, doms, chats] = await Promise.all([
    call<{ data: Channel[] }>(key, "GET", "/model-channels", { project_id: pid }),
    call<{ data: Brand[] }>(key, "GET", "/brands", { project_id: pid }),
    call<{ data: Prompt[] }>(key, "GET", "/prompts", { project_id: pid, limit: 1000 }),
    call<{ data: { id: string; name: string }[] }>(key, "GET", "/topics", { project_id: pid }),
    report("brands", ["model_channel_id"]),
    report("brands", ["prompt_id", "model_channel_id"]),
    report("brands", ["date"]),
    report("domains", []) as unknown as Promise<Domain[]>,
    call<{ total_count?: number }>(key, "GET", "/chats", { project_id: pid, start_date: start, end_date: end, limit: 1 }),
  ]);
  const channels = ch.data.filter((c) => c.is_active);
  const chanName = new Map(channels.map((c) => [c.id, c.description]));
  const own = br.data.filter((b) => b.is_own);
  const ownIds = new Set(own.map((b) => b.id));
  const mine = (rows: Row[]) => rows.filter((r) => ownIds.has(r.brand.id));

  const byChMine = new Map<string, Row[]>();
  for (const r of mine(byCh)) {
    const k = r.model_channel?.id ?? "";
    byChMine.set(k, [...(byChMine.get(k) ?? []), r]);
  }
  const chIds = [...channels.map((c) => c.id), ...[...byChMine.keys()].filter((k) => !chanName.has(k))];

  const mentions = new Map<string, number>();
  for (const r of byCh) mentions.set(r.brand.id, (mentions.get(r.brand.id) ?? 0) + (r.mention_count ?? 0));
  const totM = [...mentions.values()].reduce((a, b) => a + b, 0);
  const bname = new Map(br.data.map((b) => [b.id, b.name]));

  const topic = new Map(tp.data.map((t) => [t.id, t.name]));
  const perPrompt = new Map<string, Map<string, Row[]>>();
  for (const r of mine(byPr)) {
    const p = r.prompt?.id ?? "";
    const c = r.model_channel?.id ?? "";
    const m = perPrompt.get(p) ?? new Map<string, Row[]>();
    m.set(c, [...(m.get(c) ?? []), r]);
    perPrompt.set(p, m);
  }
  const prompts = pr.data
    .filter((p) => !p.is_archived)
    .map((p) => {
      const m = perPrompt.get(p.id) ?? new Map<string, Row[]>();
      const all = [...m.values()].flat();
      return {
        id: p.id,
        text: p.messages?.[0]?.content ?? "",
        topic: topic.get(p.topic?.id ?? "") ?? "",
        cells: Object.fromEntries([...m.entries()].map(([c, rows]) => [c, ratio(rows, "visibility_count", "visibility_total")])),
        visibility: ratio(all, "visibility_count", "visibility_total"),
        position: ratio(all, "position_sum", "position_count"),
      };
    })
    .sort((a, b) => (b.visibility ?? 0) - (a.visibility ?? 0) || a.text.localeCompare(b.text));

  const days = new Map<string, Row[]>();
  for (const r of mine(byDay)) if (r.date) days.set(r.date, [...(days.get(r.date) ?? []), r]);
  const ownHosts = new Set(own.flatMap((b) => (b.domains ?? []).map(host)));
  const domsSorted = [...doms].sort((a, b) => (b.citation_count ?? 0) - (a.citation_count ?? 0));
  const ownIdx = domsSorted.findIndex((d) => ownHosts.has(host(d.domain)));

  return {
    project,
    period: { start, end },
    chatCount: chats.total_count ?? null,
    total: metrics(mine(byCh)),
    channels: chIds.map((c) => ({ channel: c, name: chanName.get(c) ?? c, ...metrics(byChMine.get(c) ?? []) })),
    shareOfVoice: [...mentions.entries()].sort((a, b) => b[1] - a[1]).map(([id, m]) => ({ brand: bname.get(id) ?? id, own: ownIds.has(id), mentions: m, share: totM ? m / totM : null })),
    prompts,
    trend: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({ date, visibility: ratio(rows, "visibility_count", "visibility_total"), mentions: rows.reduce((s, r) => s + (r.mention_count ?? 0), 0) })),
    topDomains: domsSorted.slice(0, 15).map((d) => ({ domain: d.domain, classification: d.classification ?? null, citations: d.citation_count ?? 0, own: ownHosts.has(host(d.domain)) })),
    ownDomainRank: ownIdx >= 0 ? ownIdx + 1 : null,
    domainsTotal: domsSorted.length,
    fetchedAt: new Date().toISOString(),
  };
}

/** 채널 이름 한국어 */
export function channelLabel(name: string): string {
  return ({ "ChatGPT UI": "ChatGPT", "Google AI Overview": "구글 AI 개요", "Google AI Mode": "구글 AI 모드", "Naver AI Briefing": "네이버 AI 브리핑", "Perplexity UI": "Perplexity", "Gemini UI": "Gemini" } as Record<string, string>)[name] ?? name;
}

const pctText = (v: number | null | undefined) => (v == null ? "-" : `${Math.round(v * 100)}%`);

/** Peec 요약 → 모델에 넘길 자료 (이것만 근거로 쓴다) */
export function peecDigest(s: PeecSummary, clientName: string): string {
  const L: string[] = [];
  L.push(`고객사: ${clientName}`, `기간: ${s.period.start} ~ ${s.period.end} (매일 같은 질문을 AI 에 던진 결과, Peec AI 측정)`, `AI 답변 ${s.chatCount ?? "-"}건, 질문 ${s.prompts.length}개`);
  L.push("", `[전체] 노출률 ${pctText(s.total.visibility)} (${s.total.visible}/${s.total.answers}), 언급 ${s.total.mentions}회, 평균 순위 ${s.total.position?.toFixed(1) ?? "-"}, 감성 ${s.total.sentiment?.toFixed(0) ?? "-"}점`);
  L.push("", "[채널별] 채널 | 노출/답변 | 노출률 | 언급 | 평균 순위");
  for (const c of s.channels) L.push(`${channelLabel(c.name)} | ${c.visible}/${c.answers} | ${pctText(c.visibility)} | ${c.mentions} | ${c.position?.toFixed(1) ?? "-"}`);
  if (s.shareOfVoice.length > 1) L.push("", "[언급 점유율] " + s.shareOfVoice.slice(0, 8).map((b) => `${b.brand}${b.own ? "(우리)" : ""} ${b.mentions}회 ${pctText(b.share)}`).join(", "));
  else L.push("", "[언급 점유율] 등록된 경쟁 브랜드 없음 — 비교 자료 없음");
  L.push("", "[질문별 노출률] 질문 (주제) → 채널별");
  for (const p of s.prompts) L.push(`- ${p.text}${p.topic ? ` (${p.topic})` : ""} → ${s.channels.map((c) => `${channelLabel(c.name)} ${pctText(p.cells[c.channel])}`).join(" · ")}`);
  if (s.trend.length) L.push("", "[일별 노출률] " + s.trend.map((t) => `${t.date} ${pctText(t.visibility)}`).join(", "));
  L.push("", `[많이 인용된 출처] (우리 사이트 순위 ${s.ownDomainRank ?? "없음"} / ${s.domainsTotal}) ` + s.topDomains.map((d) => `${d.domain}${d.own ? "(우리)" : ""} ${d.citations}회`).join(", "));
  return L.join("\n");
}

