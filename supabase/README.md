# Supabase 셋업

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

## 5. 환경변수
Settings → API에서 URL / anon key / service_role key를 복사해 `.env.local`에 입력.
