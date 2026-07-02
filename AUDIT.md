# 옵티파이 워크스페이스 — 전체 감사 보고서

- **감사 일자**: 2026-07-02
- **기준 커밋**: `3fbae76` (main)
- **기준 문서**: `optify-workspace-build-spec.md` (원 기획)
- **방법**: 스펙 전 항목 대조 + 소스 전수 그렙 검증(발견 항목은 실제 코드로 재확인). 코드 수정 없음.
- **관점 태그**: `[스펙]` 누락/불일치 · `[보안]` · `[정합성]` 데이터 · `[에러]` 무반응 경로 · `[비용]` 누수

| 심각도 | 건수 |
|---|---|
| 치명 | 1 |
| 높음 | 3 |
| 중간 | 10 |
| 낮음 | 15 |

---

## 치명

### C-1. [보안] 공개 회원가입이 열려 있으면 외부인이 전체 업무 데이터 읽기/쓰기 가능
- **위치**: `supabase/migrations/0002_rls.sql` (keywords/content_plans/contents/reports 정책) + Supabase Auth 프로젝트 설정
- **근거**: 대부분의 정책이 `to authenticated using (true)`다. Supabase는 기본적으로 anon key로 `auth.signUp()` 셀프 가입이 가능하므로, **대시보드에서 가입을 막지 않았다면** 누구나 계정을 만들어 `authenticated`가 되고 → keywords·plans·contents·reports를 전부 읽고 쓸 수 있다(WP 암호문 포함 channel_settings 열람도 가능). `profiles` 행이 없어도 이 정책들은 통과한다. 스펙 §4는 "공개 가입 금지"를 전제하는데 코드/마이그레이션 어디에도 이를 강제하는 장치가 없다.
- **권장**: Supabase 대시보드 → Auth → Sign-ups 비활성화(즉시), 그리고 방어선으로 정책 조건을 `using (exists (select 1 from profiles where id = auth.uid()))` 형태로 강화.

---

## 높음

### H-1. [스펙][정합성] 채널 기본 담당자 자동 배정이 전 구간 미작동 (스펙 §7-4)
- **위치**: `supabase/migrations/0003_seed.sql` (default_assignee 미설정), `src/components/settings/settings-view.tsx` (편집 UI 없음), `src/lib/actions/keywords.ts:55` · `contents.ts:62` (읽기만 함)
- **근거**: 스펙은 "채널별 기본 담당자 자동 배정(네이버 → member)"을 요구. 코드는 `channel_settings.default_assignee`를 읽어 배정하지만, **시드가 이 값을 넣지 않고 설정 화면에도 편집 UI가 없어 항상 null** → 플랜 생성 시 담당자가 영구히 비어 있고 대시보드 "내 담당 콘텐츠"도 채워질 수 없다.
- **권장**: 설정 → 채널 탭에 기본 담당자 드롭다운 추가 + 시드/마이그레이션으로 naver_blog에 member 지정.

### H-2. [보안] WP Application Password 암호문이 브라우저로 전달되는 경로
- **위치**: `src/components/generate/generate-view.tsx:42-43`, `src/components/keywords/keywords-view.tsx:34-35`, `src/components/settings/settings-view.tsx:290-291` (모두 `channel_settings`를 `select("*")`)
- **근거**: RLS는 행 단위라 컬럼을 가리지 못하므로, 세 화면이 `select("*")`로 `wp_app_password_encrypted`를 매번 브라우저에 내려보낸다. AES-GCM 암호문이고 키는 서버 전용이라 평문 유출은 아니지만, 스펙 §4 "클라이언트에 절대 노출 금지"의 취지 위반이며 C-1과 결합 시 외부인에게도 암호문이 노출된다.
- **권장**: 세 곳의 select를 필요한 컬럼 명시로 교체(단기), 근본적으로는 비밀 컬럼을 select 정책 없는 별도 테이블로 분리(서버 service role로만 접근).

### H-3. [스펙][에러] 플랜 → 워드프레스 생성 흐름에서 제목·컨텍스트 유실
- **위치**: `src/components/generate/wordpress-generator.tsx:43-45` (`topic`/`keyword`가 빈 useState, searchParams 미수신)
- **근거**: "이 플랜으로 생성"은 `/generate?planId=…&channel=wordpress&title=…`로 이동하는데, WP 생성기는 자체 state를 쓰므로 **플랜 제목이 프리필되지 않는다**(planId 연결만 유지). 스펙 §7-2 "플랜에서 진입 시 자동 연결 + 컨텍스트 전달"의 절반이 끊긴 주 플로우 결함. 스레드/네이버는 정상.
- **권장**: `WordpressGenerator`가 부모에서 초기 topic(플랜 제목)·keyword를 props로 받아 lazy 초기화.

---

## 중간

### M-1. [정합성] `published_at`을 기록하는 코드가 없음 → "발행" 집계가 WP만 반영
- **위치**: `src/app/(app)/page.tsx:73`, `src/components/reports/reports-view.tsx:110` (읽기만 존재, 쓰는 곳 전무)
- **근거**: 발행 카운트가 `wp_post_id || published_at`인데 `published_at`은 어디서도 set되지 않음. 네이버/스레드는 수동 발행이라 시스템이 알 수 없고, 결과적으로 대시보드·리포트의 "발행"은 사실상 "WP 초안 발행"만 의미 — 리포트 수치의 의미가 라벨과 다르다.
- **권장**: 라이브러리/결과 화면에 "발행 완료로 표시" 수동 토글 추가(published_at 기록) 또는 라벨을 "WP 발행"으로 정정.

### M-2. [비용] WP JSON 재작성 재시도 호출의 토큰이 미기록
- **위치**: `src/app/api/generate/wordpress/route.ts:106` (retry의 `usage`가 inputTokens/outputTokens 합산에서 누락)
- **근거**: 본문(msg)+보강(boost)은 합산되지만 JSON 파싱 실패 시의 재작성 호출(retry, 최대 32K 출력)은 `api_usage_logs`에 잡히지 않는다.
- **권장**: retry 실행 시 `retry.usage`도 합산.

### M-3. [비용] 스트리밍 생성이 중도 실패하면 과금된 토큰이 미기록
- **위치**: `src/app/api/generate/route.ts` (catch 블록이 logApiUsage 이전 단계 오류를 삼킴)
- **근거**: 스트림 중간 오류 시 Anthropic은 이미 스트리밍된 출력분을 과금하지만, catch로 빠지면 `logApiUsage` 자체가 실행되지 않아 billed-but-unlogged.
- **권장**: catch에서도 그 시점까지 수신한 usage(또는 최소한 provider만이라도) 기록하는 finally 패턴으로 변경.

### M-4. [비용] Gemini 이미지 호출이 비용 0으로 집계
- **위치**: `src/lib/pricing.ts` (gemini 단가 없음), `src/app/api/images/generate/route.ts` (model 미전달 → cost null)
- **근거**: 대시보드/설정의 비용 합계는 `estimated_cost_usd` 합산인데 Gemini 호출은 전부 null → 이미지 비용이 총액에서 통째로 빠진다. WP 글 1건당 이미지 4장 자동 생성 구조라 누적이 작지 않음.
- **권장**: pricing에 gemini 이미지 단가(장당 고정액) 추가하고 이미지 라우트에서 model 전달.

### M-5. [에러] 무반응(silent) 실패 경로 4곳 — "키워드 빈 결과"와 같은 유형
- **위치·근거**:
  - `src/components/reports/reports-view.tsx` `genSummary()`: `if (d.ok)`만 처리, 실패 시 아무 표시 없음
  - `src/components/generate/send-to-plan.tsx` `save()`: 실패 시 모달이 조용히 열린 채 유지(에러 미표시)
  - `src/components/generate/wordpress-generator.tsx`·`naver-result.tsx` 이미지 루프: 개별 실패를 조용히 skip — 4장 요청이 2장이 되어도 안내 없음
  - `src/components/generate/naver-result.tsx`: 이미지 프롬프트 API 실패 시 "생성 이미지" 블록 자체가 사라짐(에러 상태 없음)
- **권장**: 각 경로에 실패 메시지 상태 추가(이미지 루프는 "n장 중 m장 실패" 카운트 표시).

### M-6. [스펙] "이 부분만 수정"(선택 텍스트+지시) 미구현 — 스펙 §6-6
- **위치**: `src/lib/generation/engine.ts` `buildRefinePrompt()` (작성만 되고 어떤 라우트/UI에서도 미사용 — 데드코드)
- **근거**: 스펙의 재생성/부분 수정 중 "다시 생성"만 구현됨.
- **권장**: 결과 화면에 선택 텍스트 + 지시 입력 → refine 라우트 연결(또는 스펙에서 제외 결정 후 데드코드 삭제).

### M-7. [정합성] keywords 상태 전이 불완전 + 중복 무제한
- **위치**: `src/lib/actions/keywords.ts` (곧바로 'planned'로 insert), `supabase/migrations/0001_schema.sql` (keywords에 unique 제약 없음)
- **근거**: 스펙의 `candidate`(기본값)·`discarded` 상태가 어디서도 쓰이지 않고, "플랜에 추가"만이 유일한 저장 경로라 후보 보관이 불가. 같은 키워드를 반복 추가하면 (client_id, keyword) 중복 행 + 중복 플랜이 계속 쌓인다.
- **권장**: (client_id, keyword) unique 추가 + upsert, "후보로 저장"/"버리기" 액션으로 상태 전이 구현.

### M-8. [스펙] 클라이언트 삭제(CRUD의 D) 미구현 — 스펙 §7-7
- **위치**: `src/components/settings/settings-view.tsx`, `src/lib/actions/settings.ts` (delete 없음)
- **근거**: 설정의 클라이언트 관리에 생성/수정만 있음. 스키마는 cascade가 걸려 있어 삭제 자체는 안전하게 동작할 준비가 되어 있음(콘텐츠·리포트 연쇄 삭제 주의 필요).
- **권장**: status='ended' 소프트 종료를 기본으로 하고, owner 전용 하드 삭제는 확인 문구와 함께 추가.

### M-9. [보안] AI 생성 HTML의 sanitize 미적용 (기지 사항)
- **위치**: `src/components/generate/content-result.tsx` (dangerouslySetInnerHTML)
- **근거**: CLAUDE.md에 문서화된 대로 내부 2인용 전제의 의도적 보류. 단, C-1이 열려 있는 동안에는 "신뢰된 사용자만 쓴다" 전제가 깨질 수 있어 함께 봐야 함.
- **권장**: 외부 공개(고객 열람 링크 등) 전 DOMPurify 도입 — C-1 조치 전까지는 우선순위 상향 고려.

### M-10. [정합성][에러] profiles 행 없는 인증 사용자는 무한 리다이렉트 루프
- **위치**: `src/lib/auth.ts:25` (profile 없으면 `/login`으로) ↔ `src/lib/supabase/middleware.ts:50-53` (인증 사용자가 /login 오면 `/`로)
- **근거**: owner가 Supabase에서 계정만 만들고 profiles 행 삽입(수동 단계, `supabase/README.md`)을 잊으면 로그인 직후 `/` ↔ `/login` 루프에 갇힌다. 온보딩에서 실제로 밟기 쉬운 지뢰.
- **권장**: requireProfile에서 profile 없으면 로그아웃 처리 후 "프로필 미등록" 안내 페이지로 보내기.

---

## 낮음

### L-1. [정합성] 0002 재실행 시 public 스키마의 **모든** 정책 drop
- **위치**: `supabase/migrations/0002_rls.sql:27-31`
- **근거**: 멱등 처리를 위해 `pg_policies where schemaname='public'` 전체를 지움 — 이후 다른 마이그레이션·수동 정책이 생긴 상태에서 0002를 재실행하면 그것까지 삭제된다.
- **권장**: drop 대상을 이 파일이 만드는 정책 이름 목록으로 한정.

### L-2. [보안] /api/wordpress/test·publish의 임의 URL 서버 fetch (SSRF 여지)
- **위치**: `src/app/api/wordpress/test/route.ts` (임의 wpUrl), `src/app/api/wordpress/publish/route.ts` (featuredImage.url을 그대로 fetch)
- **권장**: featuredImage.url은 자사 Storage 호스트만 허용(allowlist), test는 http(s) 스킴·사설 IP 차단.

### L-3. [정합성] 플랜당 콘텐츠가 여러 개면 "생성물 보기" 대상이 비결정적
- **위치**: `src/components/plans/plans-view.tsx` (contents 조회에 order 없음, map 덮어쓰기)
- **권장**: `order("created_at", { ascending: false })` + 최신 1건 고정.

### L-4. [정합성] exported_files가 read-modify-write라 동시 내보내기 시 기록 유실 가능
- **위치**: `src/app/api/reports/export/route.ts`
- **권장**: jsonb append(`||`) RPC 또는 별도 행 테이블로 전환. (2인 사용이라 실위험 낮음)

### L-5. [정합성] 스레드 '자동 추천' 시 content_type에 문자열 "auto"가 저장
- **위치**: `src/app/api/generate/route.ts` (AI가 실제 고른 유형 미기록)
- **권장**: 자동 선택 시 모델이 선택 유형을 함께 반환하도록 프롬프트/파싱 확장(또는 null 저장).

### L-6. [보안] 암호화 키가 SUPABASE_SERVICE_ROLE_KEY에서 파생
- **위치**: `src/lib/crypto.ts`
- **근거**: 서비스 롤 키를 회전하면 저장된 WP 암호문 전부 복호화 불가. DB 접근 키와 암호화 키가 단일 비밀이기도 함.
- **권장**: 전용 `ENCRYPTION_KEY` 환경변수로 분리(회전 시 재암호화 절차 문서화).

### L-7. [에러] 미인증 API 호출이 401 대신 /login 307 리다이렉트를 받음
- **위치**: `src/proxy.ts` matcher가 /api 포함 + `src/lib/supabase/middleware.ts`
- **권장**: pathname이 `/api/`로 시작하면 401 JSON 반환.

### L-8. [에러] saveContentAssets 반환값을 호출부가 확인하지 않음
- **위치**: `src/components/generate/wordpress-generator.tsx`, `naver-result.tsx`
- **근거**: body/images/meta 저장이 실패해도(예: 0006 미실행 환경) UI는 성공처럼 보임.
- **권장**: 실패 시 "저장 실패 — 라이브러리에 반영 안 될 수 있음" 안내.

### L-9. [정합성] 라이브러리에서 이미 발행된 WP 콘텐츠를 재발행하면 중복 초안 생성
- **위치**: `src/components/library/library-view.tsx:205` (`canPublish`가 wp_post_id 무시), `content-result.tsx:221`
- **권장**: wp_post_id 있으면 버튼을 "재발행(새 초안)" 라벨 + 확인 문구로 변경하거나 숨김.

### L-10. [스펙] Vercel 첫 배포 미실행 (스펙 §9 "Phase 1 완료 시점에 첫 배포")
- **위치**: 프로세스(리포에 vercel 설정 없음)
- **권장**: 배포 + PDF 폰트 트레이싱(`next.config.ts`의 outputFileTracingIncludes) 실동작 확인.

### L-11. [스펙] 플랜/라이브러리의 채널 필터가 DB가 아닌 정적 레지스트리 기반
- **위치**: `src/lib/channels.ts` `CHANNELS` + `plans-view.tsx`·`library-view.tsx` 필터
- **근거**: 채널을 데이터로만 추가(naver_place)하면 생성 탭에는 나타나지만 필터 드롭다운에는 안 나타남. 설계 원칙 #3의 부분 위반(표시 메타는 코드 수정 필요).
- **권장**: 필터 옵션을 channel_settings distinct 값에서 유도(라벨은 레지스트리 fallback).

### L-12. [스펙] WP 자격증명 암호화가 스펙의 "Supabase Vault 또는 pgcrypto" 대신 앱 레벨 AES-GCM
- **위치**: `src/lib/crypto.ts`
- **근거**: 기능적으론 동등(서버 전용 복호화 충족)하나 스펙과 다른 구현임을 기록. L-6과 함께 개선 시 Vault 이전 검토.
- **권장**: 현행 유지 가능 — L-6의 키 분리만 우선 적용.

### L-13. [에러] 키워드 시드 개수 미검증
- **위치**: `src/app/api/keywords/ideas/route.ts`
- **근거**: Google Ads keyword_seed 한도(≈10개) 초과 입력 시 구글 에러가 그대로 사용자에게 전달됨(무반응은 아님).
- **권장**: 서버에서 10개 초과 시 잘라내거나 안내.

### L-14. [보안] refresh token 발급 스크립트가 토큰을 터미널에 평문 출력
- **위치**: `scripts/google-ads-refresh-token.mjs`
- **근거**: 1회용 설계로는 타당하나 터미널 로그·세션 기록에 토큰이 남음(이번 세션에서도 출력됨).
- **권장**: 사용 완료 후 해당 refresh token 회전(재발급) 고려, 스크립트는 `.env.local` 직접 기록 옵션 추가.

### L-15. [에러] 스크린샷 추출의 base64 요청 바디가 Vercel 한도(4.5MB) 초과 가능
- **위치**: `src/app/api/reports/extract-metrics/route.ts`, `naver-metrics-form.tsx` (리사이즈 없음)
- **권장**: 업로드 전 클라이언트에서 max 폭 리사이즈(canvas) 후 전송.

---

## 정상 확인 항목 (이상 없음)

- **API Route 인증**: 11개 라우트 전수 `auth.getUser()` 확인 — 누락 없음. 서버 액션은 RLS로 차단됨(설계 원칙 #4 부합).
- **스키마-코드 대조**: 코드가 참조하는 전 컬럼을 0001~0006과 대조 — 불일치 없음(0006 `contents.meta` 적용 확인됨). untyped 클라이언트 구조의 실질 리스크는 현재 시점 기준 미발현.
- **RLS 매트릭스**: 스펙 §4 표와 0002 정책 일치(profiles/clients/channel_settings owner 쓰기, reports delete owner, api_usage_logs insert 서버 전용).
- **비밀 관리**: `.env*`·서비스계정 JSON 미커밋(.gitignore 확인), 복호화는 서버 라우트에서만 수행.
- **Storage**: blog-images public(스펙 명시), reports 비공개 + 서명 URL.
- **생성 엔진**: brand_rules 공통 주입, 채널 프리셋 데이터 기반 직렬화, channel text 유지(enum 없음), docx 유틸 분리, Puppeteer 미사용 — 스펙 원칙 준수.
- **비용 기록(정상 경로)**: generate/wordpress(보강 포함)/image-prompts/summary/extract-metrics/gemini/google_ads/gsc/ga4 호출 모두 api_usage_logs 기록.

## 권장 조치 순서

1. **즉시**: C-1 (Supabase 가입 차단 확인 + profiles 존재 조건 정책 강화)
2. **다음 작업 세트**: H-1(기본 담당자), H-2(select 컬럼 명시), H-3(WP 프리필), M-10(리다이렉트 루프)
3. **한 번에 묶어 처리 가능**: M-2·M-3·M-4(비용 기록 3건), M-5(silent 실패 4곳)
4. **외부 공개 전 필수**: M-9(XSS), L-2(SSRF), L-6(키 분리)
