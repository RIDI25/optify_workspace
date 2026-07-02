/** 내보내기용 정규 문서 모델 (PDF/docx 공통) */
export interface ReportDocModel {
  title: string;
  subtitle: string;
  sections: { heading: string; lines: string[] }[];
}

interface ReportData {
  content_summary?: {
    total?: number;
    published?: number;
    byChannel?: Record<string, number>;
  } | null;
  gsc?: {
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
    topQueries?: { query: string; clicks: number }[];
  } | null;
  ga4?: {
    sessions?: number;
    totalUsers?: number;
    screenPageViews?: number;
    averageSessionDuration?: number;
  } | null;
  naver_manual_metrics?: {
    blog_total_views?: number;
    blog_visitor_count?: number;
    top_inflow_keywords?: { keyword: string; count: number }[];
  } | null;
  next_month_plans?: { title: string; channel: string; scheduled_date: string | null }[];
  ai_summary?: string;
}

const num = (v: number | undefined) => Math.round(v ?? 0).toLocaleString();

export function buildReportModel(
  clientName: string,
  yearMonth: string,
  data: ReportData,
): ReportDocModel {
  const sections: ReportDocModel["sections"] = [];

  sections.push({
    heading: "요약 (AI 총평)",
    lines: [data.ai_summary?.trim() || "총평 미작성"],
  });

  const cs = data.content_summary;
  const csLines = [`총 생성 ${cs?.total ?? 0}건 · 발행 ${cs?.published ?? 0}건`];
  for (const [ch, n] of Object.entries(cs?.byChannel ?? {})) {
    csLines.push(`- ${ch}: ${n}건`);
  }
  sections.push({ heading: "발행 콘텐츠", lines: csLines });

  const g = data.gsc;
  sections.push({
    heading: "홈페이지 성과 — GSC",
    lines: g
      ? [
          `클릭 ${num(g.clicks)} · 노출 ${num(g.impressions)} · CTR ${((g.ctr ?? 0) * 100).toFixed(1)}% · 평균순위 ${(g.position ?? 0).toFixed(1)}`,
          ...(g.topQueries ?? [])
            .slice(0, 10)
            .map((q) => `- ${q.query} (${q.clicks})`),
        ]
      : ["데이터 미연동"],
  });

  const a = data.ga4;
  sections.push({
    heading: "홈페이지 성과 — GA4",
    lines: a
      ? [
          `세션 ${num(a.sessions)} · 사용자 ${num(a.totalUsers)} · 페이지뷰 ${num(a.screenPageViews)} · 평균체류 ${num(a.averageSessionDuration)}초`,
        ]
      : ["데이터 미연동"],
  });

  const n = data.naver_manual_metrics;
  sections.push({
    heading: "네이버 성과",
    lines: [
      `총 조회수 ${num(n?.blog_total_views)} · 방문자 ${num(n?.blog_visitor_count)}`,
      ...(n?.top_inflow_keywords ?? []).map((k) => `- ${k.keyword} (${k.count})`),
    ],
  });

  const plans = data.next_month_plans ?? [];
  sections.push({
    heading: "다음 달 플랜",
    lines: plans.length
      ? plans.map((p) => `- ${p.title} · ${p.channel}${p.scheduled_date ? ` · ${p.scheduled_date}` : ""}`)
      : ["예정된 플랜 없음"],
  });

  return {
    title: `${clientName} 월간 리포트`,
    subtitle: yearMonth,
    sections,
  };
}
