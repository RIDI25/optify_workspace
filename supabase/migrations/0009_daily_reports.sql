-- 데일리 리포트: SEO·GEO·AI 소식 수집 스냅샷 + AI 생성 리포트 (전역, 클라이언트 무관)
-- ⚠️ DDL — Supabase SQL Editor에서 수동 실행 필요
create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,   -- KST 기준 날짜
  collected jsonb,                    -- 수집 아이템 스냅샷 {items, failures, windowHours}
  report jsonb,                       -- AI 리포트 {headlines, stories, suggestions, passed}
  created_at timestamptz default now()
);

alter table daily_reports enable row level security;
create policy daily_reports_all on daily_reports for all
  to authenticated using (true) with check (true);
