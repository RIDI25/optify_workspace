-- ============================================================
-- 옵티파이 워크스페이스 — 고객사 온보딩 체크리스트 (0010) [기능 A-2]
-- 클라이언트별 온보딩 태스크. 행 생성/토글은 앱에서 수행.
-- ⚠️ DDL — Supabase SQL Editor에서 직접 실행 필요. 멱등.
-- ============================================================

create table if not exists client_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  task_key text not null,
  label text not null,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz default now(),
  unique (client_id, task_key)
);
create index if not exists idx_onboarding_client on client_onboarding_tasks(client_id);

alter table client_onboarding_tasks enable row level security;

drop policy if exists onboarding_select on client_onboarding_tasks;
create policy onboarding_select on client_onboarding_tasks for select
  to authenticated using (public.is_team_member());

drop policy if exists onboarding_insert on client_onboarding_tasks;
create policy onboarding_insert on client_onboarding_tasks for insert
  to authenticated with check (public.get_my_role() = 'owner');

drop policy if exists onboarding_update on client_onboarding_tasks;
create policy onboarding_update on client_onboarding_tasks for update
  to authenticated using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');

drop policy if exists onboarding_delete on client_onboarding_tasks;
create policy onboarding_delete on client_onboarding_tasks for delete
  to authenticated using (public.get_my_role() = 'owner');
