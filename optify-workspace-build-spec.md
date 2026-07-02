# 옵티파이 워크스페이스 — 빌드 지시서

> Claude Code 실행용 최종 기획 문서.
> **신규 빌드 프로젝트다. 기존의 어떤 프로젝트(리디웹스튜디오, my-assistant, 이전 옵티파이 워크스페이스 등)도 참조하거나 코드를 복사하지 않는다. 처음부터 새로 스캐폴드한다.**

---

## 0. 프로젝트 개요

- **서비스명**: 옵티파이 워크스페이스 (Optify Workspace)
- **목적**: 옵티파이(B2B SEO/GEO 마케팅)의 콘텐츠 제작·키워드 리서치·콘텐츠 플랜·월간 리포트를 통합 관리하는 2인용 내부 웹앱
- **사용자**: owner 1명(유리) + member 1명(동생, 네이버 블로그·플레이스 담당)
- **핵심 설계 원칙**:
  1. **Client-scoped 구조** — 옵티파이 자체를 `is_internal = true`인 첫 클라이언트로 등록. 추후 고객사 추가는 코드 수정 없이 데이터 추가만으로 가능해야 한다
  2. **프리셋 기반 통합 생성 엔진** — 채널별 생성기를 따로 만들지 않는다. 하나의 생성 엔진이 `channel_settings`의 프리셋을 읽어 동작한다
  3. **채널 확장 대비** — channel 값은 enum 하드코딩 금지. 추후 `naver_place` 채널(플레이스 세팅 체크리스트, 리뷰 답변 생성)이 추가될 예정이므로 메뉴·설정 구조를 채널 기반으로 잡는다
  4. **권한은 RLS로 강제** — UI에서 버튼을 숨기는 것으로 끝내지 않고 DB 레벨에서 차단한다

## 1. 기술 스택

- Next.js 14+ (App Router, TypeScript)
- Supabase: Auth(이메일/비밀번호), Postgres DB, Storage, RLS
- Vercel 배포, GitHub 리포: `optify_workspace`
- AI: Anthropic API(콘텐츠 생성), Google Gemini API(이미지 생성)
- 외부 연동: Google Ads API(키워드), Google Search Console API + GA4 Data API(리포트, 서비스 계정 방식), WordPress REST API(초안 발행)
- PDF 생성: `@react-pdf/renderer` (Puppeteer 사용 금지 — Vercel 서버리스에서 무거움)
- docx 생성: `docx` (npm) — **생성 로직은 `lib/export/docx-builder.ts` 유틸로 분리** (추후 다른 프로젝트에서 재사용 예정)

## 2. 환경변수 목록

`.env.local` 및 Vercel 환경변수. **`.env*`는 반드시 `.gitignore`에 포함하고, 서비스 계정 JSON 키 파일은 리포에 절대 커밋하지 않는다.**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # 서버 전용
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
GOOGLE_ADS_DEVELOPER_TOKEN=          # Basic Access 승인됨
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=
GOOGLE_SERVICE_ACCOUNT_KEY=          # 서비스 계정 JSON 전체를 문자열로. 서버 전용
                                     # 계정: optify-reports@theta-shuttle-501201-g6.iam.gserviceaccount.com
```

WordPress 접속 정보(사이트 URL, 사용자명, Application Password)는 환경변수가 아니라 `channel_settings` 테이블에 클라이언트별로 저장한다(암호화 필수, 아래 참조).

## 3. DB 스키마 (Supabase SQL)

```sql
-- 역할 정의: owner | member
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_internal boolean not null default false,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  gsc_site_url text,            -- 예: 'sc-domain:optify.kr' 또는 'https://optify.kr/'
  ga4_property_id text,         -- 예: '123456789'
  memo text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- 채널은 text (enum 금지). 현재: 'naver_blog' | 'wordpress' | 'threads', 추후 'naver_place'
create table channel_settings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  channel text not null,
  preset jsonb not null default '{}',   -- persona, tone_rules, structure_templates 등
  default_assignee uuid references profiles(id),
  wp_url text,
  wp_username text,
  wp_app_password_encrypted text,       -- Supabase Vault 또는 pgcrypto로 암호화 저장
  is_active boolean not null default true,
  created_at timestamptz default now(),
  unique (client_id, channel)
);

create table keywords (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  keyword text not null,
  avg_monthly_searches int,
  competition text,             -- LOW | MEDIUM | HIGH
  cpc_low numeric,
  cpc_high numeric,
  source text default 'google_ads',
  status text not null default 'candidate' check (status in ('candidate', 'planned', 'discarded')),
  memo text,
  created_at timestamptz default now()
);

create table content_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  keyword_id uuid references keywords(id) on delete set null,
  title text not null,
  channel text not null,
  status text not null default 'idea' check (status in ('idea', 'writing', 'review', 'published')),
  scheduled_date date,
  assignee uuid references profiles(id),
  memo text,
  created_at timestamptz default now()
);

create table contents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  plan_id uuid references content_plans(id) on delete set null,
  channel text not null,
  content_type text,            -- 스레드 유형(news_commentary 등), 블로그는 null 가능
  title text,
  body text not null,
  images jsonb default '[]',    -- Supabase Storage 경로 배열
  model text,
  input_tokens int,
  output_tokens int,
  wp_post_id int,               -- 워프 초안 발행 시 저장
  published_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  year_month text not null,     -- 'YYYY-MM'
  gsc_snapshot jsonb,
  ga4_snapshot jsonb,
  naver_manual_metrics jsonb,   -- 수동 입력 폼 데이터
  content_summary jsonb,        -- contents 자동 집계 결과
  next_month_plans jsonb,       -- content_plans 자동 인용
  ai_summary text,
  exported_files jsonb default '[]',  -- {format, storage_path, exported_at}[]
  status text not null default 'draft' check (status in ('draft', 'final')),
  created_at timestamptz default now(),
  unique (client_id, year_month)
);

create table api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  client_id uuid references clients(id),
  provider text not null,       -- 'anthropic' | 'gemini' | 'google_ads' | 'gsc' | 'ga4'
  input_tokens int,
  output_tokens int,
  estimated_cost_usd numeric,
  created_at timestamptz default now()
);
```

### 네이버 수동 입력 지표 스키마 (`naver_manual_metrics` jsonb 정형)

월별 추이 그래프를 그릴 수 있도록 키를 고정한다:

```json
{
  "blog_total_views": 0,
  "blog_visitor_count": 0,
  "top_inflow_keywords": [{"keyword": "", "count": 0}],   // 상위 5개
  "place_views": null,          // 추후 플레이스용, 현재 null 허용
  "place_inquiries": null,
  "note": ""
}
```

## 4. RLS 정책

모든 테이블 RLS 활성화. 헬퍼 함수:

```sql
create or replace function public.get_my_role() returns text
language sql security definer stable as $$
  select role from public.profiles where id = auth.uid()
$$;
```

정책 매트릭스:

| 테이블 | select | insert | update | delete |
|---|---|---|---|---|
| profiles | 인증 사용자 전체 | owner만 | 본인 또는 owner | owner만 |
| clients | 인증 사용자 전체 | **owner만** | **owner만** | **owner만** |
| channel_settings | 인증 사용자 전체 | **owner만** | **owner만** | **owner만** |
| keywords | 인증 사용자 전체 | 인증 사용자 | 인증 사용자 | 인증 사용자 |
| content_plans | 인증 사용자 전체 | 인증 사용자 | 인증 사용자 | 인증 사용자 |
| contents | 인증 사용자 전체 | 인증 사용자 | 인증 사용자 | 인증 사용자 |
| reports | 인증 사용자 전체 | 인증 사용자 | 인증 사용자 | owner만 |
| api_usage_logs | 인증 사용자 전체 | 서버(service role)만 | 불가 | 불가 |

- 회원가입은 공개 가입 금지. owner가 Supabase 대시보드에서 member 계정을 직접 생성하는 방식(2인 고정이므로 초대 기능 불필요)
- WordPress Application Password 복호화는 서버 사이드(API Route)에서만 수행. 클라이언트에 절대 노출 금지

## 5. 시드 데이터

마이그레이션에 포함할 시드:

1. **클라이언트**: `{ name: '옵티파이', is_internal: true, gsc_site_url: (owner가 설정에서 입력), ga4_property_id: (owner가 설정에서 입력) }`
2. **channel_settings 3건** — 아래 프리셋 JSON을 각각 `preset` 컬럼에 저장

### 5-1. 브랜드 공통 규칙 (모든 채널 프롬프트에 공통 주입)

생성 엔진의 시스템 프롬프트 최상위 층. `lib/generation/brand-rules.ts`로 관리:

```json
{
  "brand_rules": [
    "수사적 질문으로 긴장을 만들고 스스로 답하는 자문자답 구조를 핵심 수사법으로 사용",
    "핵심 메시지: '광고가 아니라 구조' — 광고 의존 탈피, 검색 노출 구조 설계가 본질",
    "근거 없는 통계·수치 생성 절대 금지. 확인 불가능하면 쓰지 않는다",
    "CTA는 강매가 아닌 논리(선점효과, 구조적 필요성) 기반으로 부드럽게",
    "회사 정체성: 홈페이지·구글 검색·네이버 플레이스와 블로그를 하나의 검색 구조로 통합 설계하는 검색 마케팅 회사"
  ]
}
```

### 5-2. 옵티파이 × threads 프리셋

```json
{
  "persona": "5년차 실전형 SEO/GEO 전문가이자 옵티파이 운영자. 독학 성장 서사를 공유하고, 업계 뉴스를 자기 언어로 해석하며, 홍보도 유머와 논리로 부드럽게 푸는 실무자 톤. 권위 대신 진정성.",
  "signature_pattern": "수사적 질문으로 긴장 생성 → 자문자답으로 해소",
  "tone_rules": [
    "정보·홍보는 '~네요/~예정이에요/~입니다' 체, 다짐·독백·츳코미는 반말",
    "마침표 대신 줄바꿈, 한 문장 한 줄, 전체 3~6줄",
    "이모지는 마지막 줄 문미에 1개만 (😁💪🏻😭🤣 계열), 본문 중간·불릿 사용 금지",
    "강조: !!! / 여운·츳코미: ... 과 (?) / 유머: ㅋㅋㅋㅋ 길게",
    "숫자로 신뢰 구축 (세 달째, 6개째, 5년전)",
    "CTA는 논리적 근거(선점효과 등) 뒤에 한 줄로 부드럽게"
  ],
  "structure_templates": {
    "news_commentary": "소식 제시 → 수사적 질문 → 통념 뒤집기 → 핵심 결론 → 출처 링크는 답글로 분리 표기",
    "motivation": "명제 → 반전 → 행동 촉구(반말)",
    "personal_story": "타임라인 나열 → 관용구 유머 → 자기 반문 + 이모지",
    "promo_cta": "시점 훅 → 활동 예고 → 사회적 증거 → 근거 있는 CTA + 이모지",
    "trust_case": "실적 수치 → 수사적 질문(왜?) → 자문자답 차별점 → 브랜드 선언 + 이모지",
    "self_deprecating": "팁 제시형 훅 → 의외의 답 + (?) → 반전 해설 → 자기 지목 + ㅋㅋㅋ + 이모지"
  },
  "banned_patterns": ["해시태그", "이모지 불릿(✅❌)", "본문 중간 이모지", "블로그식 도입부(오늘은 ~알아보겠습니다)", "개조식 정리", "격식 마무리 인사", "강매형 CTA"]
}
```

### 5-3. 옵티파이 × wordpress 프리셋

```json
{
  "persona": "데이터로 설득하는 검색 마케팅 컨설턴트. 전문직 사업자(병원·법률·세무·부동산 등)의 현실 고민(광고비, 수임, 노출)에서 출발해 수치와 출처로 논증. 권유가 아닌 논리로 결론까지 끌고 감.",
  "target_reader": "전문직·지역 기반 사업자",
  "tone_rules": [
    "'~입니다' 체 기본, 리듬 조절용 '~거예요/~구조예요' 간헐 혼용",
    "도입: 인사 없이 독자의 문제 상황 → 수사적 질문 → '이 글에서 ~알려 드리겠습니다' 예고",
    "모든 핵심 주장에 구체 수치 + 출처 명시. 확인 불가능한 수치는 생성하지 않고 [출처 필요] 로 표기",
    "논거 전개는 '첫째/둘째/셋째' H3 넘버링",
    "마무리: 볼드 3줄 핵심 요약 → 행동 촉구 → 소프트 CTA",
    "본문 이모지 금지 (내부링크 표기 📚만 허용)"
  ],
  "structure_rules": [
    "H2는 질문형 또는 결론형 문장",
    "첫 200단어 안에 핵심 질문의 직접 답변 배치 (두괄식, GEO 최적화)",
    "비교·수치는 마크다운 테이블 활용",
    "글 하단 FAQ 3~6개 (H3 질문 + 두괄식 답변)",
    "'📚함께 읽어보면 좋은 글' 형식 내부링크 자리 2~3개 제안",
    "각 섹션에 이미지 제안 + alt 텍스트 포함",
    "분량 3,000자 이상 롱폼",
    "메타 디스크립션(150자 내외)과 슬러그 제안 포함"
  ]
}
```

### 5-4. 옵티파이 × naver_blog 프리셋

```json
{
  "persona": "대표님들에게 직접 말 거는 친근한 검색 마케팅 전문가. 어렵지 않게, 실행 가능한 것 위주로 안내.",
  "target_reader": "지역 기반 사업자 대표 (병원, 사무소 등)",
  "tone_rules": [
    "'~해요/~인데요' 체 기본, 독자를 '대표님'으로 직접 호명",
    "도입: 인사 없이 독자의 상황·고민 짚기 + 메인 키워드 포함 + 글에서 얻을 것 예고",
    "문단은 2~4문장, 줄바꿈 넉넉하게",
    "통계·출처는 필수 아님 — 확실한 것만 쓰고, 불확실하면 쓰지 않음",
    "실행 지시는 '~해보세요' 형태로 구체적으로"
  ],
  "structure_rules": [
    "소제목은 질문형 또는 결론형 4~6개 (플랫 구조, 계층 없음)",
    "[이미지: 설명] 표기 2~3곳 삽입",
    "점검·해석 안내 시 '첫째/둘째/셋째' 케이스 분류 패턴 활용",
    "마무리: 핵심 요약 → 호기심형 CTA('무료 검색 노출 점검' 등) → 회사 소개 1~2문장"
  ]
}
```

## 6. 생성 엔진 설계

`lib/generation/` 아래 단일 엔진:

1. 입력: `client_id`, `channel`, (스레드일 경우) `content_type`, 주제/키워드/소재, 추가 지시
2. 프롬프트 조립: `brand_rules` (공통) + `channel_settings.preset` (채널) + 유형 템플릿 (스레드) + 사용자 입력
3. Anthropic API 호출 → 결과를 `contents`에 자동 저장 + `api_usage_logs` 기록
4. 채널별 후처리:
   - **wordpress**: 결과 화면에 "WP 초안으로 발행" 버튼 → WP REST API (`POST /wp/v2/posts`, status=draft). 성공 시 `wp_post_id` 저장. Gemini 이미지 생성 버튼 별도 제공(생성 이미지는 Supabase Storage `blog-images` 버킷 저장 후 본문 삽입 옵션)
   - **naver_blog / threads**: 복사 버튼 (마크다운 제거한 플레인 텍스트 복사 옵션 포함)
5. 스레드 생성기 UI: 유형 6개 선택 + "자동 추천" 옵션(소재만 입력하면 AI가 적합 유형 선택)
6. 재생성/부분 수정: "다시 생성", "이 부분만 수정" (선택 텍스트 + 지시) 지원

## 7. 화면별 스펙

공통 레이아웃: 좌측 사이드바(채널 기반 메뉴 구조) + 상단에 클라이언트 선택 드롭다운(전역 상태). 디자인: 화이트 모드, 악센트 네온 그린 `#00E87B`(버튼·포인트만, 넓은 면적 사용 금지), 보조 딥 그린 `#057A4E`, 틴트 배경 `#EAFBF2`, 잉크 `#1A2421`.

### 7-1. 대시보드 `/`
- 이번 주 발행 예정 (content_plans, scheduled_date 기준)
- **내 담당 콘텐츠** — 로그인 사용자가 assignee인 플랜 (member 로그인 시 최상단)
- 클라이언트별 이번 달 생성/발행 카운트
- 이번 달 API 사용량·비용 요약 (api_usage_logs 집계)

### 7-2. 콘텐츠 생성 `/generate`
- 클라이언트 선택 → 채널 탭 → (스레드) 유형 선택 → 주제 입력 → 생성
- 결과 편집 가능한 에디터 + 채널별 액션 버튼(6장 참조)
- plan_id 연결: 콘텐츠 플랜에서 진입 시 자동 연결, 생성 완료 시 플랜 status를 'review'로

### 7-3. 키워드 리서치 `/keywords`
- Google Ads API Keyword Planner 조회 (시드 키워드 입력 → 연관 키워드 + 볼륨/경쟁도/CPC)
- 결과 테이블: 정렬·필터, 체크박스 다중 선택 → **"플랜에 추가"** (선택 키워드로 content_plans 일괄 생성, keywords.status → 'planned')
- 저장된 키워드 풀 탭 (client별)

### 7-4. 콘텐츠 플랜 `/plans`
- 상단 토글: **캘린더 뷰 ↔ 리스트 뷰**
- 캘린더: scheduled_date 기준, 드래그로 일정 변경, 채널별 색상 구분
- 리스트: 상태/채널/담당자 필터
- 플랜 카드 상세: 메모, 키워드 연결 정보, **"이 플랜으로 생성" 버튼** → /generate로 컨텍스트 전달
- 채널별 기본 담당자 자동 배정 (channel_settings.default_assignee, 네이버 → member)

### 7-5. 라이브러리 `/library`
- contents 전체, 클라이언트·채널·기간·작성자 필터
- 상세 보기 + 재복사, WP 발행 상태 표시

### 7-6. 리포트 `/reports`
- 클라이언트 × 월 선택 → 리포트 생성/편집
- 섹션: ① 요약+AI 총평 ② 발행 콘텐츠(자동 집계) ③ 홈페이지 성과(GSC: 노출·클릭·평균순위·상위 쿼리 10개 / GA4: 세션·사용자·체류) ④ 네이버 성과(수동 입력 폼 — 3장의 정형 스키마, 월별 추이 그래프 / **스크린샷 업로드 → AI 수치 추출로 폼 자동 채움 보조 기능**) ⑤ 다음 달 플랜(자동 인용)
- AI 총평: 위 데이터 전체를 컨텍스트로 Anthropic API 요약 생성
- **내보내기**: PDF(@react-pdf/renderer) / docx(lib/export/docx-builder.ts). 옵티파이 브랜딩 템플릿(#00E87B 악센트, #057A4E 보조). 파일은 Storage 저장 + exported_files 기록 + 다운로드

### 7-7. 설정 `/settings` (owner 전용, member는 조회만)
- 클라이언트 관리 (CRUD, gsc_site_url·ga4_property_id 입력)
- 채널 프리셋 편집 (jsonb 에디터 또는 폼)
- WP 연결 정보 관리 (연결 테스트 버튼 포함)
- 팀원 관리 (역할 표시)
- API 사용량 상세

## 8. 외부 연동 구현 노트

- **GSC/GA4**: `GOOGLE_SERVICE_ACCOUNT_KEY` JSON을 파싱해 `google-auth-library`의 JWT 클라이언트로 인증. GSC는 Search Analytics query API(`searchanalytics.query`), GA4는 `@google-analytics/data`의 `runReport`. 모두 서버 사이드 API Route에서만 호출. 클라이언트별 `gsc_site_url`/`ga4_property_id` 사용
- **Google Ads**: `google-ads-api` (npm) 사용, KeywordPlanIdeaService로 키워드 아이디어 조회. 한국(geo target 2410), 한국어(language 1012) 기본
- **WordPress**: Application Password 방식 Basic Auth. 발행 전 "연결 테스트"(GET /wp/v2/users/me) 제공
- **Anthropic**: 스트리밍 응답으로 생성 UX 개선. 사용 토큰을 api_usage_logs에 기록
- **Gemini 이미지**: 생성 결과를 Supabase Storage `blog-images` 버킷(public)에 저장

## 9. 빌드 순서

### Phase 0 — 스캐폴드
1. Next.js + TypeScript + Tailwind 스캐폴드, 디자인 토큰 설정
2. Supabase 스키마 마이그레이션 + RLS + 시드(옵티파이 클라이언트 + 프리셋 3종)
3. Auth (로그인/로그아웃, 역할 기반 라우트 가드)
4. 공통 레이아웃 (사이드바, 클라이언트 선택기)

### Phase 1 — 핵심 기능
5. 생성 엔진 + 콘텐츠 생성 화면 (3채널)
6. WP 초안 발행 + Gemini 이미지
7. 키워드 리서치 + 플랜에 추가
8. 콘텐츠 플랜 (캘린더+리스트)
9. 라이브러리
10. 대시보드

### Phase 2 — 리포트
11. GSC/GA4 연동
12. 네이버 수동 입력 폼 + 스크린샷 AI 추출
13. 리포트 생성/편집 + AI 총평
14. PDF/docx 내보내기
15. 설정 화면 완성

각 Phase 완료 시 빌드·타입체크 통과 확인 후 커밋. Phase 1 완료 시점에 Vercel 첫 배포.

## 10. 주의사항

- 기존 프로젝트 코드 참조·복사 금지 (신규 빌드)
- `.env*`, 서비스 계정 JSON은 절대 커밋 금지 — `.gitignore` 최우선 설정
- WP Application Password는 암호화 저장, 서버에서만 복호화
- channel 값에 enum/union 하드코딩 최소화 — 채널 추가가 데이터 추가로 가능하게
- docx 생성 로직은 재사용 가능한 유틸로 분리
- 근거 없는 수치 생성 금지 규칙은 프롬프트에 반드시 포함
