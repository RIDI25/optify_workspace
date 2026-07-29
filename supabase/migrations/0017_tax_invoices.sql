-- ============================================================
-- 옵티파이 워크스페이스 — 세금계산서 발행 이력 (0017)
-- 홈택스 발행 내역을 수기 기록 → /revenue 매출 대시보드의 데이터 소스.
-- counterparty = 세금계산서 상 거래처 (파트너 경유면 파트너명),
-- end_client_name = 실고객(건명) 구분. 재무 데이터 — owner 전용.
-- ⚠️ DDL — Supabase SQL Editor에서 직접 실행. 재실행 안전(멱등).
-- ============================================================

create table if not exists tax_invoices (
  id uuid primary key default gen_random_uuid(),
  issue_date date not null,                 -- 발행일
  counterparty text not null,               -- 거래처 (세금계산서 상)
  end_client_name text,                     -- 실고객(건명)
  description text,                         -- 적요/품목
  supply_amount bigint not null default 0,  -- 공급가액
  vat_amount bigint not null default 0,     -- 부가세
  total_amount bigint not null default 0,   -- 합계
  deal_channel text not null default 'direct'
    check (deal_channel in ('direct', 'referral', 'partner')),
  quote_id uuid references quotes(id) on delete set null, -- 관련 견적(선택)
  status text not null default 'issued'
    check (status in ('issued', 'paid', 'cancelled')),    -- 발행 / 입금완료 / 취소
  paid_at date,                             -- 입금일
  memo text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_tax_invoices_issue on tax_invoices(issue_date desc);

alter table tax_invoices enable row level security;

drop policy if exists tax_invoices_all on tax_invoices;
create policy tax_invoices_all on tax_invoices for all
  to authenticated
  using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');
