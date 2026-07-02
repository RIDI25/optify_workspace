-- ============================================================
-- 옵티파이 워크스페이스 — RLS 정책 (0002)
-- ============================================================

-- 헬퍼: 현재 사용자의 역할 반환
create or replace function public.get_my_role() returns text
language sql security definer stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- 모든 테이블 RLS 활성화
alter table profiles         enable row level security;
alter table clients          enable row level security;
alter table channel_settings enable row level security;
alter table keywords         enable row level security;
alter table content_plans    enable row level security;
alter table contents         enable row level security;
alter table reports          enable row level security;
alter table api_usage_logs   enable row level security;

-- 재실행 대비 기존 정책 제거
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ── profiles ────────────────────────────────────────────────
-- select: 인증 사용자 전체 / insert: owner만 / update: 본인 또는 owner / delete: owner만
create policy profiles_select on profiles for select
  to authenticated using (true);
create policy profiles_insert on profiles for insert
  to authenticated with check (public.get_my_role() = 'owner');
create policy profiles_update on profiles for update
  to authenticated using (id = auth.uid() or public.get_my_role() = 'owner')
  with check (id = auth.uid() or public.get_my_role() = 'owner');
create policy profiles_delete on profiles for delete
  to authenticated using (public.get_my_role() = 'owner');

-- ── clients ─────────────────────────────────────────────────
-- select: 전체 / insert·update·delete: owner만
create policy clients_select on clients for select
  to authenticated using (true);
create policy clients_insert on clients for insert
  to authenticated with check (public.get_my_role() = 'owner');
create policy clients_update on clients for update
  to authenticated using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');
create policy clients_delete on clients for delete
  to authenticated using (public.get_my_role() = 'owner');

-- ── channel_settings ────────────────────────────────────────
-- select: 전체 / insert·update·delete: owner만
create policy channel_settings_select on channel_settings for select
  to authenticated using (true);
create policy channel_settings_insert on channel_settings for insert
  to authenticated with check (public.get_my_role() = 'owner');
create policy channel_settings_update on channel_settings for update
  to authenticated using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');
create policy channel_settings_delete on channel_settings for delete
  to authenticated using (public.get_my_role() = 'owner');

-- ── keywords / content_plans / contents ─────────────────────
-- select·insert·update·delete: 인증 사용자 전체
create policy keywords_all on keywords for all
  to authenticated using (true) with check (true);
create policy content_plans_all on content_plans for all
  to authenticated using (true) with check (true);
create policy contents_all on contents for all
  to authenticated using (true) with check (true);

-- ── reports ─────────────────────────────────────────────────
-- select·insert·update: 인증 사용자 전체 / delete: owner만
create policy reports_select on reports for select
  to authenticated using (true);
create policy reports_insert on reports for insert
  to authenticated with check (true);
create policy reports_update on reports for update
  to authenticated using (true) with check (true);
create policy reports_delete on reports for delete
  to authenticated using (public.get_my_role() = 'owner');

-- ── api_usage_logs ──────────────────────────────────────────
-- select: 전체 / insert: 서버(service role)만 → 정책 없음 = 클라이언트 차단.
-- service role은 RLS를 우회하므로 별도 insert 정책 불필요.
create policy api_usage_logs_select on api_usage_logs for select
  to authenticated using (true);
