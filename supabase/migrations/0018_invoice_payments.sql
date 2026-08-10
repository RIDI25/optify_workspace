-- ============================================================
-- 옵티파이 워크스페이스 — 입금 내역 (0018)
-- 세금계산서(tax_invoices) 1건에 여러 번 입금(선금/잔금 분할) 기록.
-- 미수금 = 인보이스 합계 - 입금 합계. 재무 데이터 — owner 전용.
-- ⚠️ DDL — Supabase SQL Editor에서 직접 실행. 재실행 안전(멱등).
-- ============================================================

create table if not exists invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references tax_invoices(id) on delete cascade,
  paid_date date not null,
  amount bigint not null,                  -- 입금액 (수동 입력)
  kind text not null default 'deposit'
    check (kind in ('deposit', 'balance', 'full', 'other')), -- 선금/잔금/전액/기타
  memo text,
  created_at timestamptz default now()
);

create index if not exists idx_invoice_payments_invoice on invoice_payments(invoice_id);
create index if not exists idx_invoice_payments_date on invoice_payments(paid_date desc);

alter table invoice_payments enable row level security;

drop policy if exists invoice_payments_all on invoice_payments;
create policy invoice_payments_all on invoice_payments for all
  to authenticated
  using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');
