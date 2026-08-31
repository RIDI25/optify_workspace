-- ============================================================
-- 옵티파이 워크스페이스 — 팀 스케줄(일정) (0022)
-- 월간 캘린더·주간 리스트의 데이터 소스. 캘린더에는 events 외에
-- tasks.due_date, tax_invoices.issue_date도 함께 표시된다(코드에서 병합).
-- event_type은 text — 레지스트리(src/lib/schedule.ts)로 관리.
-- ⚠️ DDL — Supabase SQL Editor에서 직접 실행. 재실행 안전(멱등).
-- ============================================================

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  event_time time,                                               -- 선택 (시간 미정 일정은 null)
  event_type text not null default 'etc',                        -- meeting(미팅)/deadline(마감)/publish(발행)/etc(기타)
  client_id uuid references clients(id) on delete set null,
  assignee_id uuid references profiles(id),
  memo text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_events_date on events(event_date);

alter table events enable row level security;

-- 팀 전체 읽기/쓰기, 삭제는 본인 생성 건 또는 owner (tasks와 동일 기준)
drop policy if exists events_select on events;
create policy events_select on events for select
  to authenticated using (public.is_team_member());
drop policy if exists events_insert on events;
create policy events_insert on events for insert
  to authenticated with check (public.is_team_member());
drop policy if exists events_update on events;
create policy events_update on events for update
  to authenticated using (public.is_team_member())
  with check (public.is_team_member());
drop policy if exists events_delete on events;
create policy events_delete on events for delete
  to authenticated using (created_by = auth.uid() or public.get_my_role() = 'owner');
