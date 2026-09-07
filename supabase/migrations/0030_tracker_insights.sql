-- ============================================================
-- 옵티파이 워크스페이스 — 트래커 추론 결과 (0030)
-- SEO·GEO 측정 뒤 Claude Fable 이 쓴 해석을 측정(run)별로 저장한다. 고객사 전달 PDF 에도 들어간다.
-- ⚠️ DDL — Supabase SQL Editor에서 수동 실행. 재실행 안전(멱등). 0002 는 재실행 금지.
-- ============================================================
create table if not exists tracker_insights (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  scope text not null,                      -- 'geo' | 'seo'
  run_id text,                              -- 어느 측정에 대한 해석인지 (tracker_runs.run_id)
  model text,                               -- 실제 답한 모델
  insight text not null,                    -- 마크다운
  input_tokens int,
  output_tokens int,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_tracker_insights_client on tracker_insights(client_id, scope, created_at desc);
alter table tracker_insights enable row level security;
drop policy if exists tracker_insights_all on tracker_insights;
create policy tracker_insights_all on tracker_insights for all
  to authenticated using (public.is_team_member()) with check (public.is_team_member());
