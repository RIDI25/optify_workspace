-- ============================================================
-- 옵티파이 워크스페이스 — 보안·정합성 강화 (0026)
-- 2026-09-06 코덱스 검토 반영: 역할 상승 차단, 팀원만 읽기, 반복 업무 중복 방지,
-- 승인 뒤 본문 수정 시 재승인, 승인 전 발행 완료 표시 차단.
-- ⚠️ DDL — Supabase SQL Editor에서 수동 실행. 재실행 안전(멱등).
-- ⚠️ 0002_rls.sql 은 public 스키마의 모든 정책을 지우고 다시 만드니 절대 다시 실행하지 말 것.
-- ============================================================

-- ── 1) profiles: 본인 이름 등은 고칠 수 있어도 role 은 owner 만 바꾼다 ──
create or replace function public.enforce_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;                       -- 서비스 키·마이그레이션 경로
  end if;
  if new.role is distinct from old.role
     and coalesce(public.get_my_role(), '') <> 'owner' then
    raise exception 'role 은 owner 만 변경할 수 있습니다';
  end if;
  return new;
end $$;

drop trigger if exists trg_profile_role on profiles;
create trigger trg_profile_role
  before update on profiles
  for each row execute function public.enforce_profile_role();

-- ── 2) 읽기도 팀원(profiles 등록)만: 셀프 가입·프로필 없는 계정 차단 ──
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  to authenticated using (public.is_team_member());

drop policy if exists clients_select on clients;
create policy clients_select on clients for select
  to authenticated using (public.is_team_member());

drop policy if exists channel_settings_select on channel_settings;
create policy channel_settings_select on channel_settings for select
  to authenticated using (public.is_team_member());

drop policy if exists api_usage_logs_select on api_usage_logs;
create policy api_usage_logs_select on api_usage_logs for select
  to authenticated using (public.is_team_member());

drop policy if exists daily_reports_all on daily_reports;
create policy daily_reports_all on daily_reports for all
  to authenticated using (public.is_team_member()) with check (public.is_team_member());

-- ── 3) tasks: 반복 업무 자동 발행의 발행 월 기록 + 같은 달 중복 생성 차단 ──
alter table tasks add column if not exists issued_ym text;   -- 템플릿 자동 발행분 'YYYY-MM'
create unique index if not exists idx_tasks_template_issued
  on tasks(template_id, issued_ym)
  where template_id is not null and issued_ym is not null;

-- ── 4) contents: 승인 뒤 본문이 바뀌면 다시 검수 대기, 승인 전엔 발행 완료 표시 불가 ──
create or replace function public.enforce_content_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_owner boolean := coalesce(public.get_my_role(), '') = 'owner';
begin
  if auth.uid() is null then
    return new;                       -- 서비스 키·마이그레이션 경로
  end if;

  if tg_op = 'INSERT' then
    if new.approval_status is distinct from 'pending' and not is_owner then
      raise exception 'approval_status는 owner만 non-pending으로 설정할 수 있습니다';
    end if;
    if new.published_at is not null and new.approval_status is distinct from 'approved' then
      raise exception '승인 후 발행 완료로 표시할 수 있습니다';
    end if;
    return new;
  end if;

  -- UPDATE: 승인된 글의 본문이 바뀌면(승인 필드는 그대로인 채) 승인을 거두고 검수 대기로
  if new.body is distinct from old.body
     and old.approval_status = 'approved'
     and new.approval_status is not distinct from old.approval_status then
    new.approval_status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
    return new;
  end if;

  if (new.approval_status is distinct from old.approval_status
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at)
     and not is_owner then
    raise exception '승인 필드는 owner만 변경할 수 있습니다';
  end if;

  -- 발행 완료 표시(published_at 이 새로 생김)는 승인된 글만
  if new.published_at is not null and old.published_at is null
     and new.approval_status is distinct from 'approved' then
    raise exception '승인 후 발행 완료로 표시할 수 있습니다';
  end if;
  return new;
end $$;
-- 트리거 trg_content_approval(0009) 는 이 함수를 그대로 가리키므로 다시 만들 필요 없음.
