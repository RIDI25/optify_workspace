-- ============================================================
-- 옵티파이 워크스페이스 — 트래커 B단계 (0031)
-- 고객사 › 기본정보 '측정 키워드·질문': 고객사가 요청한 메인 키워드(≤5)·서브 키워드(≤20)·질문(≤20)을
-- 워크스페이스에 저장하고, tracker_jobs kind=targets 로 맥 트래커(client.yaml)에 반영한다.
-- tracker_keywords 는 맥이 올리는 검색어 스냅샷 (tracker_prompts 와 같은 역할).
-- ⚠️ DDL — Supabase SQL Editor에서 수동 실행. 재실행 안전(멱등). 0002 는 재실행 금지.
-- ============================================================

create table if not exists tracker_targets (
  client_id uuid primary key references clients(id) on delete cascade,
  main_keywords jsonb not null default '[]',   -- 문자열 배열, 최대 5
  sub_keywords jsonb not null default '[]',    -- 문자열 배열, 최대 20
  questions jsonb not null default '[]',       -- [{text, intent}] 최대 20. intent: 정보형/지역형/검색형/추천형/null
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
alter table tracker_targets enable row level security;
drop policy if exists tracker_targets_all on tracker_targets;
create policy tracker_targets_all on tracker_targets for all
  to authenticated using (public.is_team_member()) with check (public.is_team_member());

-- 검색어 스냅샷 (맥 트래커가 서비스 키로 올린다. 화면은 읽기만)
create table if not exists tracker_keywords (
  client_id uuid not null references clients(id) on delete cascade,
  keyword_id text not null,                    -- K001 …
  text text not null,
  tier text,                                   -- main / sub / null
  intent text,
  target_url text,
  active boolean not null default true,
  added date,
  primary key (client_id, keyword_id)
);
alter table tracker_keywords enable row level security;
drop policy if exists tracker_keywords_select on tracker_keywords;
create policy tracker_keywords_select on tracker_keywords for select
  to authenticated using (public.is_team_member());
