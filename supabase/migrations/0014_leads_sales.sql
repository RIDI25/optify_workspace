-- ============================================================
-- 옵티파이 워크스페이스 — 리드 파이프라인·매출 (0014)
-- 계약 전 잠재고객(리드) 관리 + 견적 연결 + 매출 목표 설정.
-- 영업 데이터이므로 quotes와 동일하게 전 작업 owner 전용.
-- ⚠️ DDL — Supabase SQL Editor에서 직접 실행. 재실행 안전(멱등).
-- ============================================================

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,               -- 업체명
  contact_name text,                        -- 담당자
  phone text,
  email text,
  industry text,                            -- 업종 (병의원/법률/학원 등 자유 입력)
  region text,                              -- 지역
  source text,                              -- 유입경로 (블로그/유튜브/소개 등)
  status text not null default 'inquiry'
    check (status in ('inquiry', 'consulting', 'quoted', 'won', 'lost')),
  next_followup date,                       -- 다음 팔로업 예정일
  client_id uuid references clients(id) on delete set null, -- 수주 전환 시 연결
  memo text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_followup on leads(next_followup);

-- 견적 ↔ 리드 연결 + 수주 확정 시각 (매출 월 집계 기준)
alter table quotes add column if not exists lead_id uuid references leads(id) on delete set null;
alter table quotes add column if not exists won_at timestamptz;

-- 앱 전역 설정 (owner 전용 — 매출 목표 등)
create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

-- ── RLS: 전 작업 owner 전용 ─────────────────────────────────
alter table leads enable row level security;
alter table app_settings enable row level security;

drop policy if exists leads_all on leads;
create policy leads_all on leads for all
  to authenticated
  using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');

drop policy if exists app_settings_all on app_settings;
create policy app_settings_all on app_settings for all
  to authenticated
  using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');
