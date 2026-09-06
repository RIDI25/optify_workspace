-- ============================================================
-- 옵티파이 워크스페이스 — 승인 트리거 보완 (0027)
-- 코덱스 2차 검토 ⑤: 승인된 글의 본문 수정으로 '검수 대기'로 되돌릴 때 조기 반환하지 않고
-- 최종 상태(발행 완료 표시 등)까지 모든 검사를 적용한다.
-- ⚠️ DDL — Supabase SQL Editor에서 수동 실행. 재실행 안전(멱등). 0002 는 재실행 금지.
-- ============================================================
create or replace function public.enforce_content_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_owner boolean := coalesce(public.get_my_role(), '') = 'owner';
  reset_by_edit boolean := false;
begin
  if auth.uid() is null then
    return new;                       -- 서비스 키·마이그레이션 경로
  end if;

  if tg_op = 'INSERT' then
    if new.approval_status is distinct from 'pending' and not is_owner then
      raise exception 'approval_status는 owner만 non-pending으로 설정할 수 있습니다';
    end if;
    if new.published_at is not null and new.approval_status is distinct from 'approved' then
      raise exception '승인 후 발행 완료로 표시할 수 있습니다';
    end if;
    return new;
  end if;

  -- UPDATE: 승인된 글의 본문이 바뀌면(승인 필드는 그대로인 채) 승인을 거두고 검수 대기로
  if new.body is distinct from old.body
     and old.approval_status = 'approved'
     and new.approval_status is not distinct from old.approval_status then
    new.approval_status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
    reset_by_edit := true;
  end if;

  if not reset_by_edit
     and (new.approval_status is distinct from old.approval_status
          or new.approved_by is distinct from old.approved_by
          or new.approved_at is distinct from old.approved_at)
     and not is_owner then
    raise exception '승인 필드는 owner만 변경할 수 있습니다';
  end if;

  -- 최종 상태 검사: 발행 완료 표시(published_at 이 새로 생김)는 승인된 글만
  if new.published_at is not null and old.published_at is null
     and new.approval_status is distinct from 'approved' then
    raise exception '승인 후 발행 완료로 표시할 수 있습니다';
  end if;
  return new;
end $$;

-- ── 2026-09-06 결정: 팀원 2명 모두 같은 권한 (둘 다 owner) ──────────────
update profiles set role = 'owner' where role <> 'owner';
