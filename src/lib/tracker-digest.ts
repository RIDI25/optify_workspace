/**
 * 한 번의 측정(run)을 표·그래프·추론·PDF 가 같이 쓰는 요약으로 정리한다 (순수 함수, 서버·브라우저 공용).
 * - GEO: 질문 × 표면 → 노출·언급·인용 (회차가 여러 번이면 한 번이라도 있으면 '있음'), 표면별 비율, 경쟁사 언급, 인용 도메인
 * - SEO: 검색어 × 표면 → 최고 순위(화면 순서)·영역, 표면별 노출/3위/10위 비율
 */
import type { TrackerObservation, TrackerRankObservation } from "@/types/tracker";

export interface GeoCell {
  observed: number;
  present: number;
  mention: number;
  citation: number;
  competitors: string[];
  error: string | null;
}
export interface GeoSurfaceRow {
  surface: string;
  observed: number;
  present: number;
  mention: number;
  citation: number;
  presentRate: number | null;
  mentionRate: number | null;
  citationRate: number | null;
}
export interface GeoDigest {
  kind: "geo";
  surfaces: GeoSurfaceRow[];
  prompts: { promptId: string; text: string; intent: string; cells: Record<string, GeoCell> }[];
  competitorMentions: [string, number][];
  topDomains: [string, number][];
  totals: { observed: number; present: number; mention: number; citation: number; errors: number };
}

export interface SeoCell {
  best: number | null;
  section: string | null;
  sectionRank: number | null;
  error: string | null;
}
export interface SeoSurfaceRow {
  surface: string;
  keywords: number;
  found: number;
  top3: number;
  top10: number;
  avgBest: number | null;
}
export interface SeoDigest {
  kind: "seo";
  surfaces: SeoSurfaceRow[];
  keywords: { keywordId: string; text: string; intent: string; cells: Record<string, SeoCell> }[];
  totals: { keywords: number; found: number; top10: number };
}

const rate = (n: number, d: number): number | null => (d > 0 ? n / d : null);

export function buildGeoDigest(obs: TrackerObservation[]): GeoDigest {
  const valid = obs.filter((o) => !o.error);
  const surfaces = Array.from(new Set(obs.map((o) => o.surface))).sort();
  const promptMap = new Map<string, { promptId: string; text: string; intent: string; cells: Record<string, GeoCell> }>();
  const compCount = new Map<string, number>();
  const domainCount = new Map<string, number>();

  for (const o of obs) {
    const p = promptMap.get(o.prompt_id) ?? { promptId: o.prompt_id, text: o.prompt_text ?? "", intent: o.intent ?? "", cells: {} };
    const cell = p.cells[o.surface] ?? { observed: 0, present: 0, mention: 0, citation: 0, competitors: [], error: null };
    if (o.error) {
      cell.error = o.error;
    } else {
      cell.observed += 1;
      if (o.present) cell.present += 1;
      const brand = (o.mentions ?? []).filter((m) => m.entity_type === "brand");
      if (brand.some((m) => m.in_answer)) cell.mention += 1;
      if (brand.some((m) => m.in_citation)) cell.citation += 1;
      for (const m of o.mentions ?? []) {
        if (m.entity_type === "competitor" && m.in_answer) {
          if (!cell.competitors.includes(m.entity)) cell.competitors.push(m.entity);
          compCount.set(m.entity, (compCount.get(m.entity) ?? 0) + 1);
        }
      }
      for (const c of o.citations ?? []) if (c.domain) domainCount.set(c.domain, (domainCount.get(c.domain) ?? 0) + 1);
    }
    p.cells[o.surface] = cell;
    promptMap.set(o.prompt_id, p);
  }

  const surfaceRows: GeoSurfaceRow[] = surfaces.map((s) => {
    const rows = valid.filter((o) => o.surface === s);
    const present = rows.filter((o) => o.present);
    const mention = present.filter((o) => (o.mentions ?? []).some((m) => m.entity_type === "brand" && m.in_answer)).length;
    const citation = present.filter((o) => (o.mentions ?? []).some((m) => m.entity_type === "brand" && m.in_citation)).length;
    return {
      surface: s,
      observed: rows.length,
      present: present.length,
      mention,
      citation,
      presentRate: rate(present.length, rows.length),
      mentionRate: rate(mention, present.length),
      citationRate: rate(citation, present.length),
    };
  });
  const totals = {
    observed: valid.length,
    present: valid.filter((o) => o.present).length,
    mention: valid.filter((o) => (o.mentions ?? []).some((m) => m.entity_type === "brand" && m.in_answer)).length,
    citation: valid.filter((o) => (o.mentions ?? []).some((m) => m.entity_type === "brand" && m.in_citation)).length,
    errors: obs.length - valid.length,
  };
  return {
    kind: "geo",
    surfaces: surfaceRows,
    prompts: Array.from(promptMap.values()).sort((a, b) => a.promptId.localeCompare(b.promptId)),
    competitorMentions: Array.from(compCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8),
    topDomains: Array.from(domainCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10),
    totals,
  };
}

export function buildSeoDigest(rank: TrackerRankObservation[]): SeoDigest {
  const surfaces = Array.from(new Set(rank.map((o) => o.surface))).sort();
  const kwMap = new Map<string, { keywordId: string; text: string; intent: string; cells: Record<string, SeoCell> }>();
  for (const o of rank) {
    const k = kwMap.get(o.keyword_id) ?? { keywordId: o.keyword_id, text: o.keyword_text ?? o.keyword_id, intent: o.intent ?? "", cells: {} };
    const prev = k.cells[o.surface];
    // 회차가 여러 번이면 가장 좋은(작은) 순위
    const better = !prev || prev.best == null || (o.best_position != null && o.best_position < prev.best);
    if (!prev || better) {
      k.cells[o.surface] = { best: o.best_position, section: o.best_section, sectionRank: o.best_section_rank, error: o.error };
    }
    kwMap.set(o.keyword_id, k);
  }
  const keywords = Array.from(kwMap.values()).sort((a, b) => a.keywordId.localeCompare(b.keywordId));
  const surfaceRows: SeoSurfaceRow[] = surfaces.map((s) => {
    const cells = keywords.map((k) => k.cells[s]).filter((c): c is SeoCell => !!c && !c.error);
    const found = cells.filter((c) => c.best != null);
    return {
      surface: s,
      keywords: cells.length,
      found: found.length,
      top3: found.filter((c) => (c.best ?? 99) <= 3).length,
      top10: found.filter((c) => (c.best ?? 99) <= 10).length,
      avgBest: found.length ? found.reduce((sum, c) => sum + (c.best ?? 0), 0) / found.length : null,
    };
  });
  const allCells = keywords.flatMap((k) => Object.values(k.cells)).filter((c) => !c.error);
  return {
    kind: "seo",
    surfaces: surfaceRows,
    keywords,
    totals: { keywords: keywords.length, found: allCells.filter((c) => c.best != null).length, top10: allCells.filter((c) => (c.best ?? 99) <= 10).length },
  };
}

export type RunDigest = GeoDigest | SeoDigest;

/** 지난 측정 대비 표면별 변화 (퍼센트포인트 또는 순위 차) — 추론·PDF 문장용 */
export function compareDigests(cur: RunDigest, prev: RunDigest | null): string[] {
  if (!prev || prev.kind !== cur.kind) return [];
  const out: string[] = [];
  if (cur.kind === "geo" && prev.kind === "geo") {
    for (const s of cur.surfaces) {
      const p = prev.surfaces.find((x) => x.surface === s.surface);
      if (!p) continue;
      const d = (a: number | null, b: number | null) => (a == null || b == null ? null : Math.round((a - b) * 100));
      const dm = d(s.mentionRate, p.mentionRate);
      const dc = d(s.citationRate, p.citationRate);
      if (dm != null || dc != null) out.push(`${s.surface}: 언급률 ${dm == null ? "-" : `${dm >= 0 ? "+" : ""}${dm}%p`}, 인용률 ${dc == null ? "-" : `${dc >= 0 ? "+" : ""}${dc}%p`}`);
    }
  } else if (cur.kind === "seo" && prev.kind === "seo") {
    for (const k of cur.keywords) {
      const pk = prev.keywords.find((x) => x.keywordId === k.keywordId);
      if (!pk) continue;
      for (const [surface, c] of Object.entries(k.cells)) {
        const pc = pk.cells[surface];
        if (!pc) continue;
        if (c.best != null && pc.best != null && c.best !== pc.best) out.push(`${k.text} (${surface}): ${pc.best}위 → ${c.best}위`);
        else if (c.best != null && pc.best == null) out.push(`${k.text} (${surface}): 없음 → ${c.best}위`);
        else if (c.best == null && pc.best != null) out.push(`${k.text} (${surface}): ${pc.best}위 → 없음`);
      }
    }
  }
  return out;
}

export function pct(v: number | null | undefined): string {
  return v == null ? "-" : `${Math.round(v * 100)}%`;
}
