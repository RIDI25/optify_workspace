-- ============================================================
-- 옵티파이 워크스페이스 — 매출·영업 조회 권한 확대 (0023)
-- member도 /revenue(매출)·/sales(영업리드)를 볼 수 있도록
-- select만 팀 전체로 완화. 등록·수정·삭제는 계속 owner 전용.
-- 대상: tax_invoices, invoice_payments, leads,
--       quotes·app_settings(영업 대시보드의 수주 통계·목표 표시용).
-- ⚠️ DDL — Supabase SQL Editor에서 직접 실행. 재실행 안전(멱등).
-- ============================================================

-- ── tax_invoices: 기존 owner 전용 통합 정책 → 조회 팀/쓰기 owner 분리 ──
drop policy if exists tax_invoices_all on tax_invoices;
drop policy if exists tax_invoices_select on tax_invoices;
create policy tax_invoices_select on tax_invoices for select
  to authenticated using (public.is_team_member());
drop policy if exists tax_invoices_insert on tax_invoices;
create policy tax_invoices_insert on tax_invoices for insert
  to authenticated with check (public.get_my_role() = 'owner');
drop policy if exists tax_invoices_update on tax_invoices;
create policy tax_invoices_update on tax_invoices for update
  to authenticated using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');
drop policy if exists tax_invoices_delete on tax_invoices;
create policy tax_invoices_delete on tax_invoices for delete
  to authenticated using (public.get_my_role() = 'owner');

-- ── invoice_payments ─────────────────────────────────────────
drop policy if exists invoice_payments_all on invoice_payments;
drop policy if exists invoice_payments_select on invoice_payments;
create policy invoice_payments_select on invoice_payments for select
  to authenticated using (public.is_team_member());
drop policy if exists invoice_payments_insert on invoice_payments;
create policy invoice_payments_insert on invoice_payments for insert
  to authenticated with check (public.get_my_role() = 'owner');
drop policy if exists invoice_payments_update on invoice_payments;
create policy invoice_payments_update on invoice_payments for update
  to authenticated using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');
drop policy if exists invoice_payments_delete on invoice_payments;
create policy invoice_payments_delete on invoice_payments for delete
  to authenticated using (public.get_my_role() = 'owner');

-- ── leads ────────────────────────────────────────────────────
drop policy if exists leads_all on leads;
drop policy if exists leads_select on leads;
create policy leads_select on leads for select
  to authenticated using (public.is_team_member());
drop policy if exists leads_insert on leads;
create policy leads_insert on leads for insert
  to authenticated with check (public.get_my_role() = 'owner');
drop policy if exists leads_update on leads;
create policy leads_update on leads for update
  to authenticated using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');
drop policy if exists leads_delete on leads;
create policy leads_delete on leads for delete
  to authenticated using (public.get_my_role() = 'owner');

-- ── quotes: 조회만 팀으로 완화 (쓰기 정책은 0013 그대로) ─────
drop policy if exists quotes_select on quotes;
create policy quotes_select on quotes for select
  to authenticated using (public.is_team_member());

-- ── app_settings: 조회 팀/쓰기 owner (영업 목표 등 표시용) ───
drop policy if exists app_settings_all on app_settings;
drop policy if exists app_settings_select on app_settings;
create policy app_settings_select on app_settings for select
  to authenticated using (public.is_team_member());
drop policy if exists app_settings_insert on app_settings;
create policy app_settings_insert on app_settings for insert
  to authenticated with check (public.get_my_role() = 'owner');
drop policy if exists app_settings_update on app_settings;
create policy app_settings_update on app_settings for update
  to authenticated using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');
drop policy if exists app_settings_delete on app_settings;
create policy app_settings_delete on app_settings for delete
  to authenticated using (public.get_my_role() = 'owner');
