# 옵티파이 워크스페이스 — 팀 운영 모듈 추가 (업무·스케줄·회의록 + 비서 확장)

먼저 `CLAUDE.md`, `AGENTS.md`, `optify-workspace-build-spec.md`를 읽고 기존 설계 원칙(클라이언트 스코프, RLS 권한 강제, 채널 text 컬럼, Tailwind v4 `@theme` 토큰, 디자인 토큰)을 그대로 따라라. 기존 코드 패턴 참고 대상: `/quotes`·`/sales`·`/revenue` 페이지 구조, `src/lib/assistant/tools.ts`의 도구 정의 방식, `client_onboarding_tasks`(0010)의 태스크 패턴, `client_services`(0019)의 월 운영 계약 구조.

10월부터 member(동생)가 합류한다. 담당 업무: 네이버 플레이스·블로그 대행, 제작 보조, 스케줄 관리, 세금계산서 발행 등 서무. 이번 작업의 목표는 owner와 member가 "누가 무엇을 언제 하는지"를 이 앱 안에서 공유하는 것이다. 매출·거래처·견적·리드는 이미 있으므로 절대 새로 만들지 말 것.

## 1. 업무(태스크) 모듈 — `/tasks`

새 테이블 `tasks` (마이그레이션 0021부터, DDL은 SQL Editor 수동 실행 전제로 파일만 생성):
- title, client_id(nullable FK), assignee_id(profiles FK), due_date, status(text: todo/in_progress/review/done), task_type(text: 제작/콘텐츠/서무/응대/운영), priority(text: high/normal/low), memo, created_by, 타임스탬프
- status·task_type·priority는 enum/check 하드코딩 금지, text + 앱 레벨 상수(`src/lib/tasks.ts` 레지스트리)로

화면:
- 목록 뷰(필터: 담당자/상태/클라이언트) + 칸반 뷰(상태별 컬럼, 드래그로 상태 변경)
- "내 업무" 기본 필터(로그인 사용자 = 담당, 상태 ≠ done)
- 대시보드(홈)에 "이번 주 업무(담당자별)" 위젯 추가

반복 업무: 새 테이블 `task_templates` — client_service(월 운영 계약)에 연결, 제목 패턴·담당·매월 발행일(day of month) 보유. 매월 해당 일에 tasks로 자동 발행 (Vercel cron 사용, `client_onboarding_tasks` 자동 발급 패턴 참고). 예: "○○의원 블로그 4건 발행" 매월 1일 생성, 담당 member.

RLS: owner·member 모두 읽기/쓰기 가능. 단 삭제는 본인 생성 건 또는 owner만.

## 2. 스케줄 모듈 — `/schedule`

새 테이블 `events`: title, event_date(+시간 nullable), event_type(text: 미팅/마감/발행/기타), client_id(nullable), assignee_id(nullable), memo.
화면: 월간 캘린더 + 주간 리스트. 캘린더에는 events + tasks의 due_date + tax_invoices의 발행 예정일을 함께 표시(소스별 색 구분, 악센트 넓은 면적 금지 원칙 준수). 외부 캘린더 연동은 하지 않는다.

## 3. 회의록 모듈 — `/meetings`

새 테이블 `meeting_notes`: title, meeting_date, client_id(nullable), meeting_type(text: 고객미팅/내부회의/킥오프/월리포트), attendees(text), body(markdown), summary(text, AI 생성), decisions(text), created_by.
화면: 목록(클라이언트/유형 필터) + 상세/편집. 상세 페이지에 "액션 아이템 → 업무로 등록" 기능(제목·담당·마감 지정해 tasks 생성).
RLS: owner·member 모두 접근.

## 4. 비서(assistant) 확장 — `src/lib/assistant/tools.ts`

기존 4개 도구와 수동 tool-use 루프, 시스템 프롬프트 규칙(되묻기, 금액 해석, 권한 안내)을 유지하면서 도구 추가:

- `create_task` / `list_tasks` / `update_task_status` — "동생한테 클리어톤 블로그 발행 시켜놔, 금요일까지" → 태스크 생성
- `list_schedule` / `create_event` — "다음 주 일정 뭐 있어?", "수요일 2시 프로테이프 미팅 잡아줘"
- `save_meeting_note` — 사용자가 회의 메모/전사 텍스트를 붙여넣고 "오늘 회의록 정리해놔"라고 하면: AI가 요약·결정사항·액션아이템을 추출해 meeting_notes에 저장하고, 액션아이템은 태스크로 등록할지 목록을 보여주며 확인 후 생성
- `search_meeting_notes` — "프로테이프랑 뭐 얘기했었지?" → 해당 클라이언트 회의록 요약 답변
- `get_revenue_summary` — 월별 합계·미수금 조회. **owner 전용**: 서버에서 role 확인 후 member 요청이면 권한 안내(기존 owner-전용 패턴과 동일하게 RLS+API 양쪽에서 차단)

시스템 프롬프트에 새 도구 사용 규칙 추가: 담당자 지정 시 "동생/직원" = member 프로필, "나" = 요청자. 마감일 자연어("금요일까지", "다음 주 초") → KST 기준 날짜 변환.

## 5. 원칙

- 위에 적힌 범위만. 새 페이지·속성·기능을 임의로 추가하지 말 것.
- 마이그레이션은 0021부터 순번, 파일 생성만 하고 실행은 내가 SQL Editor에서 수동으로 한다. RLS 정책 포함할 것.
- 각 모듈 완료 시마다 빌드·타입체크 통과 확인 후 커밋. 모듈 순서: 업무 → 스케줄 → 회의록 → 비서 확장.
- UI 텍스트는 전부 한국어, 기존 디자인 토큰(네온 그린 악센트, 화이트 모드) 준수.
- 작업 시작 전에 이 계획대로 이해했는지 요약하고, 마이그레이션 DDL 초안을 먼저 보여준 뒤 승인받고 코드 작업에 들어갈 것.
