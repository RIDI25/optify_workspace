-- ============================================================
-- 0020: 채널 계정/연결 정보 — 네이버 블로그 등 채널별 아이디·비밀번호·주소·카테고리
-- 비밀번호는 서버에서 암호화(encryptSecret)해 저장, 복호화는 서버 액션에서만.
-- Supabase SQL Editor에서 실행.
-- ============================================================

alter table channel_settings
  add column if not exists account_id text,                    -- 채널 계정 아이디 (예: 네이버 아이디)
  add column if not exists account_password_encrypted text,    -- 계정 비밀번호 (암호화 저장)
  add column if not exists channel_url text,                   -- 채널 주소 (예: 블로그 URL)
  add column if not exists category text;                      -- 글 올릴 카테고리(게시판)명
