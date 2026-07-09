/**
 * Supabase 데이터베이스 타입.
 * 스키마(supabase/migrations)와 수동 동기화. 추후 `supabase gen types`로 대체 가능.
 *
 * 주의(설계 원칙 #3): channel 값에 union/enum을 하드코딩하지 않는다.
 * 채널 추가가 데이터 추가만으로 가능하도록 channel은 string으로 둔다.
 */

export type Role = "owner" | "member";
export type ClientStatus = "active" | "paused" | "ended";
export type KeywordStatus = "candidate" | "planned" | "discarded";
export type PlanStatus = "idea" | "writing" | "review" | "published";
export type ReportStatus = "draft" | "final";
export type ApprovalStatus = "pending" | "approved" | "rejected";

/** 현재 사용되는 채널 값(참고용). 하드코딩 강제 아님 — string 어디에도 대입 가능. */
export const KNOWN_CHANNELS = ["naver_blog", "wordpress", "threads"] as const;

type Timestamps = { created_at: string };

export interface Profile extends Timestamps {
  id: string;
  name: string;
  role: Role;
}

export interface Client extends Timestamps {
  id: string;
  name: string;
  is_internal: boolean;
  status: ClientStatus;
  gsc_site_url: string | null;
  ga4_property_id: string | null;
  memo: string | null;
  created_by: string | null;
}

export interface ChannelSettings extends Timestamps {
  id: string;
  client_id: string;
  channel: string;
  preset: Record<string, unknown>;
  default_assignee: string | null;
  wp_url: string | null;
  wp_username: string | null;
  wp_app_password_encrypted: string | null;
  is_active: boolean;
}

export interface Keyword extends Timestamps {
  id: string;
  client_id: string;
  keyword: string;
  avg_monthly_searches: number | null;
  competition: string | null;
  cpc_low: number | null;
  cpc_high: number | null;
  source: string | null;
  status: KeywordStatus;
  memo: string | null;
}

export interface ContentPlan extends Timestamps {
  id: string;
  client_id: string;
  keyword_id: string | null;
  title: string;
  channel: string;
  status: PlanStatus;
  scheduled_date: string | null;
  assignee: string | null;
  memo: string | null;
  external_url: string | null;
}

export interface ContentImage {
  url: string;
  alt: string;
  filename: string;
}

export interface ContentMeta {
  slug?: string;
  meta_description?: string;
  faq?: { question: string; answer: string }[];
  /** 네이버 블로그 카테고리 라벨 */
  naver_category?: string;
}

export interface Content extends Timestamps {
  id: string;
  client_id: string;
  plan_id: string | null;
  channel: string;
  content_type: string | null;
  title: string | null;
  body: string;
  images: ContentImage[] | string[];
  meta: ContentMeta | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  wp_post_id: number | null;
  published_at: string | null;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
}

export interface ContentComment {
  id: string;
  content_id: string;
  author: string | null;
  body: string;
  created_at: string;
}

/** 섹션별 AI 리포트 텍스트 (ai_summary는 종합 리포트) [migrations/0008] */
export interface SectionReports {
  google?: string;
  naver?: string;
}

export interface Report extends Timestamps {
  id: string;
  client_id: string;
  year_month: string;
  gsc_snapshot: Record<string, unknown> | null;
  ga4_snapshot: Record<string, unknown> | null;
  naver_manual_metrics: NaverManualMetrics | null;
  content_summary: Record<string, unknown> | null;
  next_month_plans: Record<string, unknown> | null;
  ai_summary: string | null;
  section_reports: SectionReports | null;
  exported_files: { format: string; storage_path: string; exported_at: string }[];
  status: ReportStatus;
}

export interface ApiUsageLog extends Timestamps {
  id: string;
  user_id: string | null;
  client_id: string | null;
  provider: string;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
}

/** 네이버 수동 입력 지표 정형 스키마 (월별 추이용 고정 키) */
export interface NaverManualMetrics {
  blog_total_views: number;
  blog_visitor_count: number;
  top_inflow_keywords: { keyword: string; count: number }[];
  place_views: number | null;
  place_inquiries: number | null;
  note: string;
}

/** 테이블별 Row/Insert/Update 헬퍼 */
type TableShape<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: TableShape<Profile>;
      clients: TableShape<Client>;
      channel_settings: TableShape<ChannelSettings>;
      keywords: TableShape<Keyword>;
      content_plans: TableShape<ContentPlan>;
      contents: TableShape<Content>;
      reports: TableShape<Report>;
      api_usage_logs: TableShape<ApiUsageLog>;
    };
    Views: Record<string, never>;
    Functions: {
      get_my_role: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
