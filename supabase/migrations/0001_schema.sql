-- ============================================================
-- 옵티파이 워크스페이스 — 스키마 (0001)
-- Supabase SQL Editor에 순서대로 실행: 0001 → 0002 → 0003
-- ============================================================

create extension if not exists pgcrypto;

-- 역할 정의: owner | member
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_internal boolean not null default false,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  gsc_site_url text,            -- 예: 'sc-domain:optify.kr' 또는 'https://optify.kr/'
  ga4_property_id text,         -- 예: '123456789'
  memo text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- 채널은 text (enum 금지). 현재: 'naver_blog' | 'wordpress' | 'threads', 추후 'naver_place'
create table if not exists channel_settings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  channel text not null,
  preset jsonb not null default '{}',
  default_assignee uuid references profiles(id),
  wp_url text,
  wp_username text,
  wp_app_password_encrypted text,       -- pgcrypto로 암호화 저장, 서버에서만 복호화
  is_active boolean not null default true,
  created_at timestamptz default now(),
  unique (client_id, channel)
);

create table if not exists keywords (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  keyword text not null,
  avg_monthly_searches int,
  competition text,             -- LOW | MEDIUM | HIGH
  cpc_low numeric,
  cpc_high numeric,
  source text default 'google_ads',
  status text not null default 'candidate' check (status in ('candidate', 'planned', 'discarded')),
  memo text,
  created_at timestamptz default now()
);

create table if not exists content_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  keyword_id uuid references keywords(id) on delete set null,
  title text not null,
  channel text not null,
  status text not null default 'idea' check (status in ('idea', 'writing', 'review', 'published')),
  scheduled_date date,
  assignee uuid references profiles(id),
  memo text,
  created_at timestamptz default now()
);

create table if not exists contents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  plan_id uuid references content_plans(id) on delete set null,
  channel text not null,
  content_type text,            -- 스레드 유형(news_commentary 등), 블로그는 null 가능
  title text,
  body text not null,
  images jsonb default '[]',    -- Supabase Storage 경로 배열
  model text,
  input_tokens int,
  output_tokens int,
  wp_post_id int,               -- 워프 초안 발행 시 저장
  published_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  year_month text not null,     -- 'YYYY-MM'
  gsc_snapshot jsonb,
  ga4_snapshot jsonb,
  naver_manual_metrics jsonb,
  content_summary jsonb,
  next_month_plans jsonb,
  ai_summary text,
  exported_files jsonb default '[]',  -- {format, storage_path, exported_at}[]
  status text not null default 'draft' check (status in ('draft', 'final')),
  created_at timestamptz default now(),
  unique (client_id, year_month)
);

create table if not exists api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  client_id uuid references clients(id),
  provider text not null,       -- 'anthropic' | 'gemini' | 'google_ads' | 'gsc' | 'ga4'
  input_tokens int,
  output_tokens int,
  estimated_cost_usd numeric,
  created_at timestamptz default now()
);

-- 조회 성능용 인덱스
create index if not exists idx_channel_settings_client on channel_settings(client_id);
create index if not exists idx_keywords_client on keywords(client_id);
create index if not exists idx_content_plans_client on content_plans(client_id);
create index if not exists idx_content_plans_scheduled on content_plans(scheduled_date);
create index if not exists idx_contents_client on contents(client_id);
create index if not exists idx_reports_client on reports(client_id);
create index if not exists idx_api_usage_logs_client on api_usage_logs(client_id);
