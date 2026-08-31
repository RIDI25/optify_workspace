-- ============================================================
-- 옵티파이 워크스페이스 — 팀 업무(태스크) + 반복 업무 템플릿 (0021)
-- 10월 member 합류 대비: 누가 무엇을 언제 하는지 공유하는 업무 보드.
-- status/task_type/priority는 text — 레지스트리(src/lib/tasks.ts)로 관리,
-- check 하드코딩 금지 원칙. 반복 업무는 월 운영 계약(client_services)에
-- 연결된 템플릿을 cron(/api/tasks/cron)이 매월 발행일에 tasks로 발행.
-- ⚠️ DDL — Supabase SQL Editor에서 직접 실행. 재실행 안전(멱등).
-- ============================================================

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_id uuid references clients(id) on delete set null,      -- 선택 (내부 업무는 null)
  assignee_id uuid references profiles(id),                      -- 담당자
  due_date date,
  status text not null default 'todo',                           -- todo/in_progress/review/done
  task_type text not null default 'ops',                         -- build(제작)/content(콘텐츠)/admin(서무)/support(응대)/ops(운영)
  priority text not null default 'normal',                       -- high/normal/low
  memo text,
  template_id uuid,                                              -- 반복 템플릿 자동 발행 건 표시 (FK는 아래에서)
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists task_templates (
  id uuid primary key default gen_random_uuid(),
  client_service_id uuid not null references client_services(id) on delete cascade,
  title text not null,                                           -- 예: "○○의원 블로그 4건 발행"
  assignee_id uuid references profiles(id),
  issue_day int not null check (issue_day between 1 and 31),     -- 매월 발행일 (그 날이 없는 달은 말일)
  task_type text not null default 'content',
  priority text not null default 'normal',
  active boolean not null default true,
  last_issued_ym text,                                           -- 'YYYY-MM' — cron 중복 발행 방지
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- tasks.template_id FK (템플릿 삭제 시 태스크는 남기고 연결만 해제)
do $$ begin
  alter table tasks add constraint tasks_template_fk
    foreign key (template_id) references task_templates(id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists idx_tasks_assignee_status on tasks(assignee_id, status);
create index if not exists idx_tasks_due on tasks(due_date);
create index if not exists idx_tasks_client on tasks(client_id);
create index if not exists idx_task_templates_service on task_templates(client_service_id);

alter table tasks enable row level security;
alter table task_templates enable row level security;

-- 팀 전체 읽기/쓰기, 삭제는 본인 생성 건 또는 owner
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select
  to authenticated using (public.is_team_member());
drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert
  to authenticated with check (public.is_team_member());
drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update
  to authenticated using (public.is_team_member())
  with check (public.is_team_member());
drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks for delete
  to authenticated using (created_by = auth.uid() or public.get_my_role() = 'owner');

drop policy if exists task_templates_select on task_templates;
create policy task_templates_select on task_templates for select
  to authenticated using (public.is_team_member());
drop policy if exists task_templates_insert on task_templates;
create policy task_templates_insert on task_templates for insert
  to authenticated with check (public.is_team_member());
drop policy if exists task_templates_update on task_templates;
create policy task_templates_update on task_templates for update
  to authenticated using (public.is_team_member())
  with check (public.is_team_member());
drop policy if exists task_templates_delete on task_templates;
create policy task_templates_delete on task_templates for delete
  to authenticated using (created_by = auth.uid() or public.get_my_role() = 'owner');
