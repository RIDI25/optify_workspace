@AGENTS.md

# 옵티파이 워크스페이스 (Optify Workspace)

옵티파이(B2B SEO/GEO 마케팅)의 콘텐츠 제작·키워드 리서치·콘텐츠 플랜·월간 리포트를
통합 관리하는 2인용(owner 유리 + member 동생) 내부 웹앱. 전체 기획은
`optify-workspace-build-spec.md` 참조 — 그 문서가 단일 진실 소스다.

## 핵심 설계 원칙 (반드시 준수)
1. **Client-scoped** — 옵티파이 자체가 `is_internal=true`인 첫 클라이언트. 고객사 추가는 코드 수정 없이 데이터 추가로.
2. **프리셋 기반 통합 생성 엔진** — 채널별 생성기 분리 금지. 하나의 엔진이 `channel_settings.preset`을 읽어 동작.
3. **채널 확장 대비** — channel은 DB에 `text`(enum/union 하드코딩 금지). 추후 `naver_place` 예정. 표시용 메타는 `src/lib/channels.ts` 레지스트리.
4. **권한은 RLS로 강제** — UI 숨김으로 끝내지 않고 DB 레벨 차단.

## 기술 스택
Next.js 16 (App Router, ⚠️ AGENTS.md 참고: 학습 데이터와 다른 breaking change 있음) · TypeScript ·
Tailwind v4 (CSS `@theme` 토큰, `tailwind.config` 파일 없음) · Supabase(Auth/DB/Storage/RLS) ·
Anthropic(콘텐츠) · Gemini(이미지) · Google Ads/GSC/GA4 · `@react-pdf/renderer`(Puppeteer 금지) ·
`docx`(생성 로직은 `lib/export/docx-builder.ts`로 분리, 재사용 예정).

## 디자인 토큰 (globals.css `@theme`)
악센트 네온 그린 `--color-accent #00E87B`(버튼·포인트 전용, 넓은 면적 금지) · 보조 딥그린
`--color-accent-deep #057A4E` · 틴트 `--color-tint #EAFBF2` · 잉크 `--color-ink #1A2421`. 화이트 모드 고정.

## 보안 불변 규칙
- `.env*`·서비스계정 JSON 절대 커밋 금지(`.gitignore`에 반영됨).
- WP Application Password는 `channel_settings.wp_app_password_encrypted`에 암호화 저장, **복호화는 서버(API Route)에서만**.
- `SUPABASE_SERVICE_ROLE_KEY`·`GOOGLE_SERVICE_ACCOUNT_KEY`는 서버 전용. 클라이언트 번들 유입 금지.
- 근거 없는 통계·수치 생성 금지 — 생성 프롬프트(`lib/generation/brand-rules.ts`)에 필수 포함.
- **XSS**: 생성 결과 미리보기·라이브러리 상세는 AI 생성 HTML을 `dangerouslySetInnerHTML`로 렌더한다
  (`components/generate/content-result.tsx`). 내부 2인용 도구·신뢰 소스 전제라 현재는 sanitize 미적용.
  **외부에 공개(고객 열람 링크, 퍼블릭 페이지 등)하는 시점에는 반드시 HTML sanitize(예: DOMPurify) 도입**할 것.

## 현재 상태
Phase 1 완료(생성 엔진·WP/네이버/스레드·키워드·플랜·라이브러리·대시보드), Phase 2 진행 중(리포트).
영업 축 완료(owner 전용): /quotes 견적서(품목 카탈로그 `lib/quote-items.ts`, 공급자·계좌·지급조건 `lib/quote-config.ts`,
계약 조항 `lib/contract-terms.ts`, 계약서·청구서는 견적 내역의 문서 생성 드롭다운) + /sales 리드 파이프라인·매출
대시보드(수주 리드 → 클라이언트 전환 시 온보딩 태스크 자동 발급).
DB: `supabase/migrations/0001~0014`. DDL은 SQL Editor에서 수동 실행 (0013=quotes, 0014=leads·app_settings).
각 기능 완료 시 빌드·타입체크 통과 후 커밋.

## 셋업 (Supabase)
`supabase/migrations/0001 → 0002 → 0003` 순서로 SQL Editor 실행. 이후 대시보드에서 owner/member
계정 생성 → 각 `auth.users`에 대응하는 `profiles` 행 삽입(role 지정). 키는 `.env.local`에 입력.
