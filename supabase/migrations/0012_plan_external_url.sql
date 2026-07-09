-- 콘텐츠 플랜에 외부 작성 글 링크 저장.
-- 생성 엔진을 거치지 않고 따로 작성·발행한 글을 제목+링크로 플랜에 등록하기 위함.
-- DDL이므로 Supabase SQL Editor에서 수동 실행.

alter table content_plans add column if not exists external_url text;
