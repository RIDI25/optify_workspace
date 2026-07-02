-- ============================================================
-- 옵티파이 워크스페이스 — RLS 강화 (0007) [AUDIT C-1]
-- authenticated만으로는 셀프 가입 계정도 통과하므로,
-- keywords/content_plans/contents/reports 정책에 "profiles 행 존재(팀 멤버)" 조건 추가.
-- ⚠️ DDL이므로 Supabase SQL Editor에서 직접 실행 필요. 재실행 안전(멱등).
-- ============================================================

-- 헬퍼: 현재 사용자가 팀 멤버(profiles 등록)인지
create or replace function public.is_team_member() returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

-- ── keywords / content_plans / contents ─────────────────────
drop policy if exists keywords_all on keywords;
create policy keywords_all on keywords for all
  to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

drop policy if exists content_plans_all on content_plans;
create policy content_plans_all on content_plans for all
  to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

drop policy if exists contents_all on contents;
create policy contents_all on contents for all
  to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

-- ── reports (delete는 기존 owner 전용 정책 유지) ─────────────
drop policy if exists reports_select on reports;
create policy reports_select on reports for select
  to authenticated using (public.is_team_member());

drop policy if exists reports_insert on reports;
create policy reports_insert on reports for insert
  to authenticated with check (public.is_team_member());

drop policy if exists reports_update on reports;
create policy reports_update on reports for update
  to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());
