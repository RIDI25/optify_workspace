-- ============================================================
-- 옵티파이 트래커 연동 (0025)
-- 맥에서 도는 옵티파이 트래커(~/optify-tracker)가 측정 결과를 여기로 올린다.
-- 쓰기는 트래커(서비스 키)와 owner만, 읽기는 팀 전체.
-- ⚠️ DDL — Supabase SQL Editor에서 수동 실행 필요
-- ============================================================

-- 고객사 ↔ 트래커 폴더 이름(slug) 연결
alter table clients add column if not exists tracker_slug text;
create unique index if not exists idx_clients_tracker_slug
  on clients(tracker_slug) where tracker_slug is not null;

-- 고객사별 트래커 상태 스냅샷 (준비 상태·켜진 표면·경쟁사 이름)
create table if not exists tracker_clients (
  client_id uuid primary key references clients(id) on delete cascade,
  slug text not null,
  name text not null,
  active boolean not null default false,          -- 매주 자동 실행 여부
  readiness jsonb not null default '[]',          -- 준비 부족 항목 (문자열 배열)
  enabled_surfaces jsonb not null default '[]',   -- 켜진 표면 (naver_aib, google_aio, chatgpt …)
  prompts_active int not null default 0,
  keywords_active int not null default 0,
  competitors jsonb not null default '[]',        -- 경쟁사 이름 배열
  brand_aliases jsonb not null default '[]',
  synced_at timestamptz not null default now()
);

-- AI 모델에게 던지는 질문(프롬프트) 스냅샷
create table if not exists tracker_prompts (
  client_id uuid not null references clients(id) on delete cascade,
  prompt_id text not null,                        -- P001 …
  intent text,                                    -- 정보형/지역형/비교추천형/브랜드형
  text_search text,
  text_chat text,
  active boolean not null default true,
  added date,
  retired date,
  primary key (client_id, prompt_id)
);

-- 실행 이력 (한 번의 측정 = run)
create table if not exists tracker_runs (
  run_id text primary key,                        -- 예: 2026W36-optify
  client_id uuid not null references clients(id) on delete cascade,
  week text not null,                             -- ISO 주 2026W36
  started_at timestamptz,
  finished_at timestamptz,
  status text not null default 'done',            -- done / failed / running
  surfaces jsonb not null default '[]',
  reps jsonb,
  conditions jsonb not null default '{}',         -- IP·기기·로그인 상태 등 측정 조건
  break_flag text,
  break_note text,
  observations int not null default 0,
  present int not null default 0,
  errors int not null default 0,
  synced_at timestamptz not null default now()
);
create index if not exists idx_tracker_runs_client on tracker_runs(client_id, started_at desc);

-- AI 표면 관측 (질문 1개 × 표면 1개 × 회차 1개). 인용·판정·업체명은 jsonb 배열로 같이 둔다.
create table if not exists tracker_observations (
  obs_id text primary key,
  client_id uuid not null references clients(id) on delete cascade,
  run_id text not null references tracker_runs(run_id) on delete cascade,
  week text not null,
  prompt_id text not null,
  prompt_variant text,
  prompt_text text,
  intent text,
  surface text not null,
  rep int not null default 1,
  collected_at timestamptz,
  present boolean not null default false,         -- AI 답변 블록이 떴는가
  refused boolean not null default false,
  answer_text text,
  answer_length int not null default 0,
  model_id text,
  device text,
  screenshot_path text,                           -- Storage 'tracker' 버킷 경로
  error text,
  conditions jsonb not null default '{}',
  citations jsonb not null default '[]',          -- [{rank,url,domain,title,publisher,source_type,inline_count}]
  mentions jsonb not null default '[]',           -- [{entity_type,entity,in_answer,matched_alias,first_pos,mention_order,in_citation,citation_ranks}]
  entities jsonb not null default '[]'            -- [{name_raw,name_norm,matched_to,source}]
);
create index if not exists idx_tracker_obs_client_week on tracker_observations(client_id, week, surface);
create index if not exists idx_tracker_obs_run on tracker_observations(run_id);

-- 검색 순위 관측 (검색어 1개 × 표면 1개 × 회차 1개)
create table if not exists tracker_rank_observations (
  obs_id text primary key,
  client_id uuid not null references clients(id) on delete cascade,
  run_id text not null references tracker_runs(run_id) on delete cascade,
  week text not null,
  keyword_id text not null,
  keyword_text text,
  intent text,
  target_url text,
  surface text not null,                          -- naver_web / google_web
  rep int not null default 1,
  collected_at timestamptz,
  present boolean not null default false,
  items_count int not null default 0,
  best_position int,                              -- 화면에 보이는 순서 (광고·플레이스 포함)
  best_section text,
  best_section_rank int,
  best_matched_by text,
  sections jsonb not null default '{}',
  items jsonb not null default '[]',              -- [{position,section,section_rank,url,domain,title,owned}]
  screenshot_path text,
  error text,
  conditions jsonb not null default '{}'
);
create index if not exists idx_tracker_rank_client_week on tracker_rank_observations(client_id, week, surface);
create index if not exists idx_tracker_rank_run on tracker_rank_observations(run_id);

-- 주간 지표 (고객사 × 주 × 표면 × 의도 × 지표)
create table if not exists tracker_weekly_metrics (
  client_id uuid not null references clients(id) on delete cascade,
  week text not null,
  surface text not null,
  intent text not null,                           -- all / 정보형 / 지역형 / 비교추천형 / 브랜드형
  metric text not null,                           -- exposure_rate, mention_rate, … competitor_mention_rate:<이름>
  value double precision,                         -- 분모 0이면 null (0이 아니다)
  numerator double precision,
  denominator double precision,
  computed_at timestamptz,
  primary key (client_id, week, surface, intent, metric)
);

-- 월간 리포트 파일 (맥에서 만든 PDF/HTML을 Storage에 올린 경로)
create table if not exists tracker_reports (
  client_id uuid not null references clients(id) on delete cascade,
  month text not null,                            -- 'YYYY-MM'
  pdf_path text,
  html_path text,
  generated_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (client_id, month)
);

-- 실행 요청 대기열 (B단계: 워크스페이스 '지금 실행' 버튼 → 맥이 집어서 실행)
create table if not exists tracker_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  kind text not null default 'run',               -- run / report / sync
  params jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  requested_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  log text
);
create index if not exists idx_tracker_jobs_status on tracker_jobs(status, created_at);

-- ── RLS ──────────────────────────────────────────────────────
alter table tracker_clients           enable row level security;
alter table tracker_prompts           enable row level security;
alter table tracker_runs              enable row level security;
alter table tracker_observations      enable row level security;
alter table tracker_rank_observations enable row level security;
alter table tracker_weekly_metrics    enable row level security;
alter table tracker_reports           enable row level security;
alter table tracker_jobs              enable row level security;

-- 읽기: 팀 전체 / 쓰기: owner (트래커 엔진은 서비스 키라 RLS를 거치지 않음)
do $$
declare t text;
begin
  foreach t in array array['tracker_clients', 'tracker_prompts', 'tracker_runs', 'tracker_observations',
                           'tracker_rank_observations', 'tracker_weekly_metrics', 'tracker_reports']
  loop
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('create policy %I_select on %I for select to authenticated using (public.is_team_member())', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_write on %I for all to authenticated using (public.get_my_role() = ''owner'') with check (public.get_my_role() = ''owner'')', t, t);
  end loop;
end $$;

-- 실행 요청은 팀 누구나 넣을 수 있고, 상태 변경은 owner(또는 서비스 키)
drop policy if exists tracker_jobs_select on tracker_jobs;
create policy tracker_jobs_select on tracker_jobs for select
  to authenticated using (public.is_team_member());
drop policy if exists tracker_jobs_insert on tracker_jobs;
create policy tracker_jobs_insert on tracker_jobs for insert
  to authenticated with check (public.is_team_member());
drop policy if exists tracker_jobs_update on tracker_jobs;
create policy tracker_jobs_update on tracker_jobs for update
  to authenticated using (public.get_my_role() = 'owner') with check (public.get_my_role() = 'owner');
drop policy if exists tracker_jobs_delete on tracker_jobs;
create policy tracker_jobs_delete on tracker_jobs for delete
  to authenticated using (public.get_my_role() = 'owner');

-- ── Storage: 캡처·리포트 PDF 버킷 (비공개, 팀만 읽기) ─────────
insert into storage.buckets (id, name, public)
  values ('tracker', 'tracker', false)
  on conflict (id) do nothing;
drop policy if exists tracker_objects_select on storage.objects;
create policy tracker_objects_select on storage.objects for select
  to authenticated using (bucket_id = 'tracker' and public.is_team_member());
