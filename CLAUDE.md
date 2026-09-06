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
옵티파이 트래커와 같은 화이트+블루(2026-09-06 전환). 악센트 블루 `--color-accent #2563EB`(버튼·포인트 전용, 넓은 면적 금지) ·
보조 딥블루 `--color-accent-deep #1D4ED8` · 틴트 `--color-tint #EFF6FF` · 잉크 `--color-ink #111827` · 옅은 배경 `--color-subtle #F4F6FA`.
화이트 모드 고정. 화면 컴포넌트에 색을 직접 박지 말고 토큰 클래스(`bg-accent`, `text-accent-deep`, `bg-tint`)를 쓴다.
PDF 문서(`lib/export/*-pdf.tsx`)·카드뉴스·브랜드 설명(`lib/generation/business-context.ts`)의 네온 그린은 옵티파이 브랜드 자산이라 그대로 둔다.

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
대시보드(수주 리드 → 클라이언트 전환 시 온보딩 태스크 자동 발급) + /diagnosis SEO 진단(`lib/seo-audit/` —
라이브 체크 + 스크리밍프로그 Internal CSV 교차 검증, AI 소견, PDF 리포트, 실패 항목 → 견적 초안 자동 생성).
거래 경로 구분(`lib/deal-channels.ts`): 직접/소개/파트너 경유 — 파트너 경유 건은 세금계산서 거래처=파트너(partner_name),
실고객은 end_client_name(문서에 '건명'으로 표기). 매출 대시보드에 경로별 수주 구성 집계.
/revenue 매출: 세금계산서 발행 이력 수기 입력(수주 견적 프리필 지원) — 발행/입금/미수금 집계 + 거래처별 월 적층 차트.
팀 운영 축(owner·member 공용): /tasks 업무 보드(목록·칸반 드래그, 레지스트리 `lib/tasks.ts`) + 반복 업무 템플릿(월 운영
계약 연결, `/api/tasks/cron`이 매일 KST 00:20에 발행일 체크 — vercel.json crons) + /schedule 캘린더(events+업무
마감+계산서 발행일 병합, 레지스트리 `lib/schedule.ts`) + 대시보드 '이번 주 업무' 위젯.
AI 비서(우하단 위젯 → `/api/assistant`, Claude Opus 5 tool-use 루프, 도구는 `lib/assistant/tools.ts` 레지스트리):
세금계산서·입금·리드 등록 + 업무·일정 등록/조회/상태 변경 + 매출 요약(owner 전용). 실행은 사용자 세션 → RLS 적용.
/sales·/revenue는 member도 조회 가능(0023 — select 팀, 쓰기 owner. 페이지는 readOnly 모드로 편집 UI 숨김).
/ledger 회계 장부(팀 공용 기입, 레지스트리 `lib/ledger.ts`): 입금·지출·카드 내역 수기 기입 + 세금계산서
입금(invoice_payments) 자동 병합 표시(이중 기입 방지) + 월 단위 세무 전달용 CSV(UTF-8 BOM) 내보내기.
옵티파이 트래커 연동 A단계(2026-09-06, 읽기 전용): 맥의 `~/optify-tracker`(GEO·SEO 측정기)가 실행·리포트 뒤 `tracker sync`로
결과를 Supabase 에 올린다(`tracker_*` 테이블 7개 + `tracker_jobs` 대기열 + Storage `tracker` 버킷, `clients.tracker_slug` 로 연결).
/tracking 화면(개요·추세·결과 보기, `components/tracking/`, 라벨·계산은 `lib/tracker.ts`) + 대시보드 위젯(`components/dashboard/tracker-summary.tsx`).
'지금 실행'·고객사 등록 마법사(B단계)와 콘텐츠 발행→조치 기록·키워드→질문·리포트 섹션·AI 비서 도구(C단계)는 아직 맥 앱에 있다.
사이드바 IA(2026-09-06 재편, `lib/nav.ts` NAV_BLOCKS): 두 블록으로 시각 구분 — 🏢 옵티파이 내부 업무(대시보드·영업·회계·팀·관리, 회색 카드) / 🤝 고객사 업무(파란 틴트 카드: 고객사 선택 + 진행중 계약 칩, 콘텐츠 1~4 접이식(localStorage 기억), SEO=/tracking?view=seo, GEO=/tracking?view=geo, 통합리포트=/reports). 계약 서비스(`client_services`)에 없는 업무는 흐리게만 표시하고 숨기지 않는다(기능 변화 없음). 상단 고객사 탭(client-tabs)은 제거.
/tracking 은 `view` 쿼리로 같은 데이터를 GEO(AI 노출)·SEO(검색 순위) 관점으로 나눠 보여 준다 (개요 탭은 공통).
DB: `supabase/migrations/0001~0025`. DDL은 SQL Editor에서 수동 실행 (0013=quotes, 0014=leads·app_settings, 0015=seo_diagnoses, 0016=deal_channels, 0017=tax_invoices, 0018=invoice_payments, 0019=client_services, 0020=channel_connection, 0021=tasks·task_templates, 0022=events, 0023=매출·영업 조회 팀 확대, 0024=ledger_entries, 0025=tracker_* 트래커 연동).
각 기능 완료 시 빌드·타입체크 통과 후 커밋.

## 셋업 (Supabase)
`supabase/migrations/0001 → 0002 → 0003` 순서로 SQL Editor 실행. 이후 대시보드에서 owner/member
계정 생성 → 각 `auth.users`에 대응하는 `profiles` 행 삽입(role 지정). 키는 `.env.local`에 입력.
