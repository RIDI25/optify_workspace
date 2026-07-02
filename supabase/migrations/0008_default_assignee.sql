-- ============================================================
-- 옵티파이 워크스페이스 — 채널 기본 담당자 (0008) [AUDIT H-1]
-- 스펙 §7-4: 네이버 채널의 기본 담당자 = member.
-- member 프로필이 있어야 효과가 있으며, 이미 값이 있으면 건드리지 않음(멱등).
-- ⚠️ DML이지만 profiles(member) 등록 이후 실행해야 의미 있음 — SQL Editor에서 실행.
-- ============================================================

update channel_settings
set default_assignee = (
  select id from public.profiles
  where role = 'member'
  order by created_at
  limit 1
)
where channel = 'naver_blog'
  and default_assignee is null
  and exists (select 1 from public.profiles where role = 'member');
