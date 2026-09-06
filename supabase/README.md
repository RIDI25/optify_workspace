# Supabase 셋업

> ⚠️ **운영 DB 에서 `0002_rls.sql` 을 다시 실행하지 마세요.** 0002 는 public 스키마의 정책을 전부 지운 뒤 초기 정책만 다시 만들기 때문에
> 이후 기능(0007·0009·0013~0026)의 접근 정책이 사라집니다. 새 DB 에 처음 세팅할 때만 씁니다.
>
> **현재 상태(2026-09-06)**: `migrations/0001` → … → `0026_hardening.sql` 까지 파일 이름 순서대로 모두 실행돼 있어야 합니다.
> 접두사가 겹치는 `0008_default_assignee` / `0008_report_sections`, `0009_content_approval` / `0009_daily_reports` 는 서로 독립이라 둘 다 실행합니다.
> 새 마이그레이션은 SQL Editor 에서 손으로 실행하고, 적용한 번호를 CLAUDE.md 에 적습니다.

## 1. 마이그레이션 실행
Supabase 대시보드 → SQL Editor에서 아래 순서대로 실행:

1. `migrations/0001_schema.sql` — 테이블 + 인덱스
2. `migrations/0002_rls.sql` — RLS 활성화 + 정책 + `get_my_role()`
3. `migrations/0003_seed.sql` — 옵티파이 클라이언트 + 채널 프리셋 3종

재실행해도 안전하도록 작성돼 있습니다(idempotent).

## 2. 계정 생성 (공개 가입 없음)
Authentication → Users → **Add user**로 owner/member 계정을 직접 생성합니다.
비밀번호 방식(이메일/비밀번호).

## 3. profiles 행 연결
계정 생성 후, 각 사용자를 `profiles`에 등록해야 로그인·역할이 동작합니다.
SQL Editor에서(이메일을 실제 값으로 교체):

```sql
insert into profiles (id, name, role)
select id, '유리', 'owner' from auth.users where email = 'OWNER_EMAIL'
on conflict (id) do update set name = excluded.name, role = excluded.role;

insert into profiles (id, name, role)
select id, '동생', 'member' from auth.users where email = 'MEMBER_EMAIL'
on conflict (id) do update set name = excluded.name, role = excluded.role;
```

## 4. Storage 버킷 (Phase 1에서 사용)
- `blog-images` (public) — Gemini 생성 이미지
- 리포트 내보내기 파일 저장용 버킷은 Phase 2에서 추가
- `reports` / `quotes` (private) — 리포트·견적서 내보내기. 최초 내보내기 시 서버가 자동 생성.

## 5. 환경변수
Settings → API에서 URL / anon key / service_role key를 복사해 `.env.local`에 입력.
