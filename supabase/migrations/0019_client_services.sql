-- ============================================================
-- 옵티파이 워크스페이스 — 고객사 계약 서비스 (0019)
-- 고객사마다 계약한 서비스 항목(사이트 제작·GEO 콘텐츠·플레이스 세팅·관리 등)을
-- 등록하고, 이를 기준으로 업무 플로우를 구분한다.
-- service_type은 레지스트리(src/lib/services.ts) 키 — 하드코딩 enum 금지 원칙에 따라 text.
-- ⚠️ DDL — Supabase SQL Editor에서 직접 실행. 재실행 안전(멱등).
-- ============================================================

create table if not exists client_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  service_type text not null,               -- 'site_build' | 'geo_content' | 'place_setup' | 'naver_manage' …
  billing text not null default 'one_time'
    check (billing in ('one_time', 'period')), -- 일회성 / 기간제
  status text not null default 'active'
    check (status in ('active', 'done', 'paused', 'ended')), -- 진행중/완료/일시중지/종료
  start_date date,
  end_date date,                            -- 기간제: 계약 종료일 (기본 6개월)
  amount bigint,                            -- 일회성 금액 (원, 선택)
  monthly_fee bigint,                       -- 기간제 월 비용 (원, 선택)
  quote_id uuid references quotes(id) on delete set null, -- 관련 견적 (선택)
  memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_client_services_client on client_services(client_id);
create index if not exists idx_client_services_end on client_services(end_date);

alter table client_services enable row level security;

-- 조회: 팀 멤버 전체 (업무 기준 정보) / 편집: owner 전용 (계약 정보)
drop policy if exists client_services_select on client_services;
create policy client_services_select on client_services for select
  to authenticated using (public.is_team_member());

drop policy if exists client_services_insert on client_services;
create policy client_services_insert on client_services for insert
  to authenticated with check (public.get_my_role() = 'owner');

drop policy if exists client_services_update on client_services;
create policy client_services_update on client_services for update
  to authenticated
  using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');

drop policy if exists client_services_delete on client_services;
create policy client_services_delete on client_services for delete
  to authenticated using (public.get_my_role() = 'owner');
