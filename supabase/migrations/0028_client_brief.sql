-- ============================================================
-- 옵티파이 워크스페이스 — 개편 2차 (0028)
-- 고객사 카드 기본정보: 회사 정보 칸, 콘텐츠 기준(말투·독자·꼭 넣을 것·금지 표현), 계약 월 약정 수량.
-- ⚠️ DDL — Supabase SQL Editor에서 수동 실행. 재실행 안전(멱등). 0002 는 재실행 금지.
-- ============================================================

-- 회사 정보 (모두 선택 입력 — 비워 둬도 된다)
alter table clients add column if not exists industry text;      -- 업종 (자유 입력)
alter table clients add column if not exists region text;        -- 지역
alter table clients add column if not exists website_url text;   -- 홈페이지
alter table clients add column if not exists blog_url text;      -- 네이버 블로그
alter table clients add column if not exists place_url text;     -- 네이버 플레이스
alter table clients add column if not exists contact_name text;  -- 고객 담당자
alter table clients add column if not exists contact_phone text;

-- 계약: 월 약정 수량 (기간제 콘텐츠 계약에서 '이번 달 4건 중 2건' 표시용). 항목명(service_type)은 원래 자유 text.
alter table client_services add column if not exists monthly_quota int;

-- 콘텐츠 기준 — 고객사별 글쓰기 기준. 생성 엔진이 시스템 프롬프트에 넣는다.
create table if not exists client_briefs (
  client_id uuid primary key references clients(id) on delete cascade,
  tone text,             -- 말투 (예: 차분하고 전문적, '~합니다' 기본)
  audience text,         -- 독자 (예: 40~60대 만성 통증 환자)
  must_include text,     -- 꼭 넣을 것 (예: 진료 시간, 예약 전화)
  banned text,           -- 금지 표현 (예: 완치, 100%, 최고)
  notes text,            -- 참고 (링크·문서·주의점 자유 기록)
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
alter table client_briefs enable row level security;
drop policy if exists client_briefs_all on client_briefs;
create policy client_briefs_all on client_briefs for all
  to authenticated using (public.is_team_member()) with check (public.is_team_member());
