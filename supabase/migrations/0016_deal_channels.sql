-- ============================================================
-- 옵티파이 워크스페이스 — 거래 경로 구분 (0016)
-- 매출이 직접 / 소개 / 파트너(리드젠랩 등) 경유로 나뉘므로 리드·견적에 태깅.
-- 파트너 경유 건: 세금계산서 거래처 = 파트너(partner_name),
--                실제 고객(엔드 클라이언트) = end_client_name (내부 구분·문서 건명 표기용).
-- 파트너명은 하드코딩 금지 원칙에 따라 text 자유 입력.
-- ⚠️ DDL — Supabase SQL Editor에서 직접 실행. 재실행 안전(멱등).
-- ============================================================

alter table leads add column if not exists deal_channel text not null default 'direct'
  check (deal_channel in ('direct', 'referral', 'partner'));
alter table leads add column if not exists partner_name text;  -- 파트너명 또는 소개자명

alter table quotes add column if not exists deal_channel text not null default 'direct'
  check (deal_channel in ('direct', 'referral', 'partner'));
alter table quotes add column if not exists partner_name text;
alter table quotes add column if not exists end_client_name text; -- 실고객(건명) — 파트너 경유 시 구분용
