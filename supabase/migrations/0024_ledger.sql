-- ============================================================
-- 옵티파이 워크스페이스 — 회계 장부 (0024)
-- 입금·지출·카드 사용 내역을 수기 기입하는 단식 장부.
-- 세금계산서 입금(invoice_payments)은 장부 화면에서 자동 병합 표시 —
-- 여기에 이중 기입하지 않는다. 월 단위 CSV로 세무사무소 전달.
-- entry_type/payment_method/category는 text — 레지스트리(src/lib/ledger.ts).
-- ⚠️ DDL — Supabase SQL Editor에서 직접 실행. 재실행 안전(멱등).
-- ============================================================

create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  entry_type text not null default 'expense',    -- income(입금) / expense(지출)
  payment_method text not null default 'card',   -- card/transfer/cash/other
  amount bigint not null,                        -- 원 (양수)
  counterparty text,                             -- 거래처/사용처
  description text,                              -- 적요 (무슨 돈인지)
  category text not null default 'etc',          -- 계정 분류 (레지스트리 키)
  memo text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ledger_date on ledger_entries(entry_date desc);

alter table ledger_entries enable row level security;

-- 기입은 서무 업무 — 팀 전체 읽기/쓰기, 삭제는 본인 기입 건 또는 owner
drop policy if exists ledger_select on ledger_entries;
create policy ledger_select on ledger_entries for select
  to authenticated using (public.is_team_member());
drop policy if exists ledger_insert on ledger_entries;
create policy ledger_insert on ledger_entries for insert
  to authenticated with check (public.is_team_member());
drop policy if exists ledger_update on ledger_entries;
create policy ledger_update on ledger_entries for update
  to authenticated using (public.is_team_member())
  with check (public.is_team_member());
drop policy if exists ledger_delete on ledger_entries;
create policy ledger_delete on ledger_entries for delete
  to authenticated using (created_by = auth.uid() or public.get_my_role() = 'owner');
