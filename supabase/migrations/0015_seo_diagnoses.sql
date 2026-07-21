-- ============================================================
-- 옵티파이 워크스페이스 — SEO 진단 (0015)
-- URL + 스크리밍프로그 CSV 교차 진단 결과 저장. 영업 도구 — owner 전용.
-- ⚠️ DDL — Supabase SQL Editor에서 직접 실행. 재실행 안전(멱등).
-- ============================================================

create table if not exists seo_diagnoses (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  lead_id uuid references leads(id) on delete set null,
  has_csv boolean not null default false,
  total_score int,
  results jsonb not null,                    -- DiagnosisResult 전체
  ai_summary text,                           -- AI 종합 소견
  exported_files jsonb not null default '[]',
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create index if not exists idx_seo_diagnoses_created on seo_diagnoses(created_at desc);

alter table seo_diagnoses enable row level security;

drop policy if exists seo_diagnoses_all on seo_diagnoses;
create policy seo_diagnoses_all on seo_diagnoses for all
  to authenticated
  using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');
