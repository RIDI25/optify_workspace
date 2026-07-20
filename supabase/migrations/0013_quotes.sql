-- ============================================================
-- 옵티파이 워크스페이스 — 견적서 (0013)
-- 계약 전 고객 대상이므로 clients와 무관하게 고객사명을 수기 저장.
-- 품목은 발행 시점 스냅샷(jsonb) — 이후 카탈로그가 바뀌어도 과거 견적 불변.
-- ⚠️ DDL이므로 Supabase SQL Editor에서 직접 실행. 재실행 안전(멱등).
-- ============================================================

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no text not null unique,            -- 'OPT-YYYYMMDD-NN'
  customer_name text not null,              -- 고객사명 (수기 입력)
  customer_contact text,                    -- 담당자명
  customer_phone text,
  customer_email text,
  quote_date date not null default current_date,
  valid_until date,
  items jsonb not null default '[]',        -- QuoteLineItem[] 스냅샷
  vat_mode text not null default 'excluded' check (vat_mode in ('excluded', 'included')),
  supply_amount bigint not null default 0,  -- 공급가액
  vat_amount bigint not null default 0,     -- 부가세
  total_amount bigint not null default 0,   -- 합계
  notes text,                               -- 특약사항·비고
  status text not null default 'draft' check (status in ('draft', 'sent', 'won', 'expired')),
  exported_files jsonb not null default '[]', -- {format, storage_path, exported_at}[]
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_quotes_quote_date on quotes(quote_date desc);

-- ── RLS: 단가 정보 포함 → 전 작업 owner 전용 ─────────────────
alter table quotes enable row level security;

drop policy if exists quotes_select on quotes;
create policy quotes_select on quotes for select
  to authenticated using (public.get_my_role() = 'owner');

drop policy if exists quotes_insert on quotes;
create policy quotes_insert on quotes for insert
  to authenticated with check (public.get_my_role() = 'owner');

drop policy if exists quotes_update on quotes;
create policy quotes_update on quotes for update
  to authenticated
  using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');

drop policy if exists quotes_delete on quotes;
create policy quotes_delete on quotes for delete
  to authenticated using (public.get_my_role() = 'owner');
