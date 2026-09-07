-- ============================================================
-- 옵티파이 워크스페이스 — 트래커 B단계 + 구글 자동 갱신 (0029)
-- 워크스페이스에서 트래커 자동 실행·표면 설정과 '지금 실행'을 보내고, 맥 워커의 상태를 본다.
-- ⚠️ DDL — Supabase SQL Editor에서 수동 실행. 재실행 안전(멱등). 0002 는 재실행 금지.
-- ============================================================

-- 서치콘솔·GA4 자동 갱신 (Vercel 크론: 매주 월요일 이번 달 갱신, 매월 2일 지난달 확정)
alter table clients add column if not exists google_auto_fetch boolean not null default false;

-- 맥 워커 살아 있음 표시 (트래커 `tracker jobs` 가 1분마다 갱신)
create table if not exists tracker_worker (
  id text primary key,            -- 'mac'
  last_seen timestamptz,
  host text,
  version text,
  note text
);
alter table tracker_worker enable row level security;
drop policy if exists tracker_worker_select on tracker_worker;
create policy tracker_worker_select on tracker_worker for select
  to authenticated using (public.is_team_member());
-- 쓰기는 서비스 키(맥 워커)만 — 정책 없음
