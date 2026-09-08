/**
 * 옵티파이 트래커 연동 타입 (supabase/migrations/0025_tracker.sql 과 수동 동기화).
 * 맥에서 도는 트래커가 올리는 측정 결과. 워크스페이스는 읽기만 한다 (A단계).
 */

export interface TrackerClient {
  client_id: string;
  slug: string;
  name: string;
  active: boolean;
  readiness: string[];
  enabled_surfaces: string[];
  prompts_active: number;
  keywords_active: number;
  competitors: string[];
  brand_aliases: string[];
  synced_at: string;
}

export interface TrackerPrompt {
  client_id: string;
  prompt_id: string;
  intent: string | null;
  text_search: string | null;
  text_chat: string | null;
  active: boolean;
  added: string | null;
  retired: string | null;
}

export interface TrackerRun {
  run_id: string;
  client_id: string;
  week: string;
  started_at: string | null;
  finished_at: string | null;
  status: string;
  surfaces: string[];
  reps: Record<string, number> | null;
  conditions: Record<string, unknown>;
  break_flag: string | null;
  break_note: string | null;
  observations: number;
  present: number;
  errors: number;
  synced_at: string;
}

export interface TrackerCitation {
  rank: number | null;
  url: string | null;
  domain: string | null;
  title: string | null;
  publisher: string | null;
  source_type: string | null;
  inline_count: number | null;
}

export interface TrackerMention {
  entity_type: "brand" | "competitor" | string;
  entity: string;
  in_answer: boolean;
  matched_alias: string | null;
  first_pos: number | null;
  mention_order: number | null;
  in_citation: boolean;
  citation_ranks: number[];
}

export interface TrackerEntity {
  name_raw: string;
  name_norm: string;
  matched_to: string | null;
  source: "answer" | "publisher" | string;
}

export interface TrackerObservation {
  obs_id: string;
  client_id: string;
  run_id: string;
  week: string;
  prompt_id: string;
  prompt_variant: string | null;
  prompt_text: string | null;
  intent: string | null;
  surface: string;
  rep: number;
  collected_at: string | null;
  present: boolean;
  refused: boolean;
  answer_text: string | null;
  answer_length: number;
  model_id: string | null;
  device: string | null;
  screenshot_path: string | null;
  error: string | null;
  conditions: Record<string, unknown>;
  citations: TrackerCitation[];
  mentions: TrackerMention[];
  entities: TrackerEntity[];
}

export interface TrackerRankItem {
  position: number | null;
  section: string | null;
  section_rank: number | null;
  url: string | null;
  domain: string | null;
  title: string | null;
  owned: boolean;
}

export interface TrackerRankObservation {
  obs_id: string;
  client_id: string;
  run_id: string;
  week: string;
  keyword_id: string;
  keyword_text: string | null;
  intent: string | null;
  target_url: string | null;
  surface: string;
  rep: number;
  collected_at: string | null;
  present: boolean;
  items_count: number;
  best_position: number | null;
  best_section: string | null;
  best_section_rank: number | null;
  best_matched_by: string | null;
  sections: Record<string, unknown>;
  items: TrackerRankItem[];
  screenshot_path: string | null;
  error: string | null;
  conditions: Record<string, unknown>;
}

export interface TrackerWeeklyMetric {
  client_id: string;
  week: string;
  surface: string;
  intent: string;
  metric: string;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  computed_at: string | null;
}

export interface TrackerReport {
  client_id: string;
  month: string;
  pdf_path: string | null;
  html_path: string | null;
  generated_at: string | null;
  synced_at: string;
}

/** 0025 tracker_jobs — 워크스페이스 → 맥 워커 실행 요청 */
export interface TrackerJob {
  id: string;
  client_id: string | null;
  kind: "run" | "settings" | "report" | "sync" | "targets" | string;
  params: Record<string, unknown>;
  status: "queued" | "running" | "done" | "failed";
  requested_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result: Record<string, unknown> | null;
  log: string | null;
}

/** 0029 tracker_worker — 맥 워커 살아 있음 */
export interface TrackerWorker {
  id: string;
  last_seen: string | null;
  host: string | null;
  version: string | null;
  note: string | null;
}

/** 0030 tracker_insights — 측정별 Claude 추론 */
export interface TrackerInsight {
  id: string;
  client_id: string;
  scope: "geo" | "seo" | string;
  run_id: string | null;
  model: string | null;
  insight: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_by: string | null;
  created_at: string;
}

/** 0031 tracker_targets — 고객사가 요청한 측정 키워드·질문. 워크스페이스가 쓰고, 맥이 kind=targets 로 반영한다 */
export interface TargetQuestion {
  text: string;
  intent: string | null; // 정보형 / 지역형 / 검색형 / 추천형 / null(트래커가 추정)
}
export interface TrackerTargets {
  client_id: string;
  main_keywords: string[];
  sub_keywords: string[];
  questions: TargetQuestion[];
  updated_by: string | null;
  updated_at: string;
}

/** 0031 tracker_keywords — 맥 트래커 검색어 스냅샷 (읽기 전용) */
export interface TrackerKeyword {
  client_id: string;
  keyword_id: string;
  text: string;
  tier: "main" | "sub" | null;
  intent: string | null;
  target_url: string | null;
  active: boolean;
  added: string | null;
}
