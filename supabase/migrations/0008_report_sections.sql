-- 리포트 3단 플로우: 구글/네이버 섹션별 AI 리포트 텍스트 저장
-- (ai_summary는 종합 리포트로 사용)
-- ⚠️ DDL — Supabase SQL Editor에서 수동 실행 필요
alter table reports add column if not exists section_reports jsonb;
-- 형식: { "google": "…", "naver": "…" }
