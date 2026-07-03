-- ============================================================
-- 옵티파이 워크스페이스 — 콘텐츠 승인 + 코멘트 (0009)
-- 승인 대상은 생성된 콘텐츠(contents). member 생성물만 pending, owner 생성물은 approved.
-- ⚠️ DDL 포함 — Supabase SQL Editor에서 직접 실행 필요. 멱등.
-- ============================================================

-- ── contents 승인 컬럼 ──────────────────────────────────────
alter table contents
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected'));
alter table contents
  add column if not exists approved_by uuid references profiles(id);
alter table contents
  add column if not exists approved_at timestamptz;

-- 기존 콘텐츠는 전부 approved로 백필(현재 운영 영향 없음)
update contents set approval_status = 'approved'
  where approval_status = 'pending' and approved_at is null and created_at < now();

-- ── content_comments ───────────────────────────────────────
create table if not exists content_comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references contents(id) on delete cascade,
  author uuid references profiles(id),
  body text not null,
  created_at timestamptz default now()
);
create index if not exists idx_content_comments_content on content_comments(content_id);

alter table content_comments enable row level security;

drop policy if exists content_comments_select on content_comments;
create policy content_comments_select on content_comments for select
  to authenticated using (public.is_team_member());

drop policy if exists content_comments_insert on content_comments;
create policy content_comments_insert on content_comments for insert
  to authenticated with check (public.is_team_member() and author = auth.uid());

drop policy if exists content_comments_delete on content_comments;
create policy content_comments_delete on content_comments for delete
  to authenticated using (author = auth.uid());

-- ── 승인 필드는 owner만 변경 가능 (DB 레벨 강제) ────────────
-- auth.uid()가 null이면(서버 service role/마이그레이션) 통과 — 앱 경로는 user client 사용.
create or replace function public.enforce_content_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.approval_status is distinct from 'pending'
       and coalesce(public.get_my_role(), '') <> 'owner' then
      raise exception 'approval_status는 owner만 non-pending으로 설정할 수 있습니다';
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.approval_status is distinct from old.approval_status
        or new.approved_by is distinct from old.approved_by
        or new.approved_at is distinct from old.approved_at)
       and coalesce(public.get_my_role(), '') <> 'owner' then
      raise exception '승인 필드는 owner만 변경할 수 있습니다';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_content_approval on contents;
create trigger trg_content_approval
  before insert or update on contents
  for each row execute function public.enforce_content_approval();
