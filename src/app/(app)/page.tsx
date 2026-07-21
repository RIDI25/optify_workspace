import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { channelLabel } from "@/lib/channels";
import { planStatusLabel } from "@/lib/plan-status";
import { autoDoneKeys } from "@/lib/onboarding";
import type { Client, Content, ContentPlan, ApiUsageLog } from "@/types/database";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const now = new Date();
  // 이번 주 (월~일)
  const day = now.getDay(); // 0=일
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // 승인 위젯: owner=대기 전체, member=본인 반려 [Feature 3]
  const pendingCountRes = supabase
    .from("contents")
    .select("id", { count: "exact", head: true })
    .eq("approval_status", "pending");
  const myRejectedRes = supabase
    .from("contents")
    .select("id", { count: "exact", head: true })
    .eq("approval_status", "rejected")
    .eq("created_by", profile.id);

  const onboardingRes = supabase
    .from("client_onboarding_tasks")
    .select("client_id, task_key, done");
  const csRes = supabase
    .from("channel_settings")
    .select("client_id, channel, wp_app_password_encrypted");
  const kwRes = supabase.from("keywords").select("client_id");

  const [clientsRes, weekPlansRes, myPlansRes, contentsRes, usageRes] =
    await Promise.all([
      supabase.from("clients").select("*"),
      supabase
        .from("content_plans")
        .select("*")
        .gte("scheduled_date", ymd(weekStart))
        .lte("scheduled_date", ymd(weekEnd))
        .order("scheduled_date"),
      supabase
        .from("content_plans")
        .select("*")
        .eq("assignee", profile.id)
        .neq("status", "published")
        .order("scheduled_date", { nullsFirst: false }),
      supabase
        .from("contents")
        .select("client_id, wp_post_id, published_at, created_at")
        .gte("created_at", monthStart.toISOString()),
      supabase
        .from("api_usage_logs")
        .select("provider, estimated_cost_usd, input_tokens, output_tokens, created_at")
        .gte("created_at", monthStart.toISOString()),
    ]);

  const clients = (clientsRes.data ?? []) as Client[];
  const weekPlans = (weekPlansRes.data ?? []) as ContentPlan[];
  const myPlans = (myPlansRes.data ?? []) as ContentPlan[];
  const contents = (contentsRes.data ?? []) as Pick<
    Content,
    "client_id" | "wp_post_id" | "published_at" | "created_at"
  >[];
  const usage = (usageRes.data ?? []) as Pick<
    ApiUsageLog,
    "provider" | "estimated_cost_usd"
  >[];

  const clientName = (id: string) =>
    clients.find((c) => c.id === id)?.name ?? "-";

  // 클라이언트별 이번 달 생성/발행
  const perClient = clients.map((c) => {
    const rows = contents.filter((x) => x.client_id === c.id);
    return {
      id: c.id,
      name: c.name,
      generated: rows.length,
      published: rows.filter((r) => r.wp_post_id || r.published_at).length,
    };
  });

  const totalCost = usage.reduce(
    (sum, u) => sum + (Number(u.estimated_cost_usd) || 0),
    0,
  );

  const pendingCount = profile.role === "owner" ? (await pendingCountRes).count ?? 0 : 0;
  const myRejectedCount =
    profile.role === "member" ? (await myRejectedRes).count ?? 0 : 0;

  // 팔로업 예정 리드 (owner 전용 — RLS로도 owner만 조회됨)
  const followupCount =
    profile.role === "owner"
      ? (
          await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .lte("next_followup", ymd(now))
            .in("status", ["inquiry", "consulting", "quoted"])
        ).count ?? 0
      : 0;

  // 온보딩 진행중 클라이언트 (is_internal 제외) [A-2]
  const [onboarding, cs, kws] = await Promise.all([
    onboardingRes,
    csRes,
    kwRes,
  ]);
  const tasksAll = (onboarding.data ?? []) as {
    client_id: string;
    task_key: string;
    done: boolean;
  }[];
  const csAll = (cs.data ?? []) as {
    client_id: string;
    channel: string;
    wp_app_password_encrypted: string | null;
  }[];
  const kwAll = (kws.data ?? []) as { client_id: string }[];
  const onboardingClients = clients
    .filter((c) => !c.is_internal)
    .map((c) => {
      const auto = autoDoneKeys({
        hasGscGa4Ids: !!(c.gsc_site_url && c.ga4_property_id),
        hasWpCreds: csAll.some(
          (x) =>
            x.client_id === c.id &&
            x.channel === "wordpress" &&
            x.wp_app_password_encrypted,
        ),
        hasPresets: csAll.some((x) => x.client_id === c.id),
        hasKeywords: kwAll.some((x) => x.client_id === c.id),
      });
      const clientTasks = tasksAll.filter((t) => t.client_id === c.id);
      const remaining = clientTasks.filter(
        (t) => !t.done && !auto.has(t.task_key),
      ).length;
      return { id: c.id, name: c.name, total: clientTasks.length, remaining };
    })
    .filter((x) => x.total > 0 && x.remaining > 0);

  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">대시보드</h1>
        <p className="mt-1 text-sm text-muted">
          {profile.name}님 · {monthLabel}
        </p>
      </div>

      {/* 콘텐츠 워크플로우 한눈에 */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          콘텐츠 워크플로우
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { step: 1, href: "/keywords", label: "키워드 발굴", desc: "리포트 분석 → ☆ 보관" },
            { step: 2, href: "/plans", label: "플랜 기획", desc: "주제 뽑기 → 일정 배정" },
            { step: 3, href: "/generate", label: "콘텐츠 생성", desc: "프리셋 기반 AI 생성" },
            { step: 4, href: "/library", label: "검수·발행", desc: "승인 → WP·채널 발행" },
            { step: 5, href: "/reports", label: "성과 확인", desc: "월간 리포트 · GSC" },
          ].map((s, i) => (
            <div key={s.step} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted">→</span>}
              <Link
                href={s.href}
                className="group rounded-lg border border-border px-3 py-2 transition-colors hover:border-accent-deep hover:bg-tint/40"
              >
                <p className="text-xs font-semibold text-ink group-hover:text-accent-deep">
                  <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded bg-subtle font-mono text-[10px] text-muted group-hover:bg-accent-deep group-hover:text-white">
                    {s.step}
                  </span>
                  {s.label}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">{s.desc}</p>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* 승인 위젯 [Feature 3] */}
      {profile.role === "owner" && pendingCount > 0 && (
        <Link
          href="/library?approval=pending"
          className="block rounded-lg border border-accent-deep/30 bg-tint/40 p-4 hover:bg-tint"
        >
          <p className="text-sm font-semibold text-accent-deep">
            승인 대기 콘텐츠 {pendingCount}건
          </p>
          <p className="mt-0.5 text-xs text-muted">
            클릭하면 라이브러리에서 대기 목록을 확인합니다.
          </p>
        </Link>
      )}
      {profile.role === "member" && myRejectedCount > 0 && (
        <Link
          href="/library?approval=rejected"
          className="block rounded-lg border border-red-200 bg-red-50 p-4 hover:bg-red-100"
        >
          <p className="text-sm font-semibold text-red-600">
            반려된 콘텐츠 {myRejectedCount}건
          </p>
          <p className="mt-0.5 text-xs text-muted">
            코멘트를 확인하고 수정 후 다시 요청하세요.
          </p>
        </Link>
      )}

      {/* 팔로업 예정 리드 (owner) */}
      {profile.role === "owner" && followupCount > 0 && (
        <Link
          href="/sales"
          className="block rounded-lg border border-amber-300 bg-amber-50 p-4 hover:bg-amber-100"
        >
          <p className="text-sm font-semibold text-amber-700">
            팔로업 예정 리드 {followupCount}건
          </p>
          <p className="mt-0.5 text-xs text-muted">
            영업·리드에서 오늘까지 팔로업할 리드를 확인하세요.
          </p>
        </Link>
      )}

      {/* 온보딩 진행중 클라이언트 [A-2] */}
      {onboardingClients.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">
            온보딩 진행중 클라이언트
          </h2>
          <ul className="space-y-2">
            {onboardingClients.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <Link
                  href="/settings"
                  className="text-ink hover:text-accent-deep hover:underline"
                >
                  {c.name}
                </Link>
                <span className="text-xs text-muted">
                  미완료 {c.remaining} / {c.total}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* member: 내 담당을 최상단으로 */}
      {profile.role === "member" && (
        <MyPlansCard plans={myPlans} clientName={clientName} />
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* 이번 주 발행 예정 */}
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">
            이번 주 발행 예정
          </h2>
          {weekPlans.length === 0 ? (
            <p className="text-sm text-muted">예정된 플랜이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {weekPlans.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-ink">{p.title}</span>
                  <span className="ml-3 shrink-0 font-mono text-xs text-muted">
                    {p.scheduled_date} · {channelLabel(p.channel)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 이번 달 API 사용량 */}
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">
            이번 달 API 사용량
          </h2>
          <p className="text-2xl font-bold text-accent-deep">
            ${totalCost.toFixed(2)}
          </p>
          <p className="mt-1 text-sm text-muted">
            호출 {usage.length}건 (Anthropic / Gemini / Google Ads 합산 추정)
          </p>
        </section>
      </div>

      {/* owner: 내 담당을 하단에 */}
      {profile.role === "owner" && (
        <MyPlansCard plans={myPlans} clientName={clientName} />
      )}

      {/* 클라이언트별 이번 달 */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          클라이언트별 이번 달 생성 / 발행
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {perClient.map((c) => (
            <div key={c.id} className="rounded-md border border-border p-3">
              <p className="text-sm font-medium text-ink">{c.name}</p>
              <p className="mt-1 text-sm text-muted">
                생성 <span className="font-mono text-ink">{c.generated}</span> ·
                발행 <span className="font-mono text-ink">{c.published}</span>
              </p>
            </div>
          ))}
          {perClient.length === 0 && (
            <p className="text-sm text-muted">클라이언트가 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function MyPlansCard({
  plans,
  clientName,
}: {
  plans: ContentPlan[];
  clientName: (id: string) => string;
}) {
  return (
    <section className="rounded-lg border border-accent-deep/30 bg-tint/40 p-4">
      <h2 className="mb-3 text-sm font-semibold text-accent-deep">
        내 담당 콘텐츠
      </h2>
      {plans.length === 0 ? (
        <p className="text-sm text-muted">담당 중인 플랜이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {plans.slice(0, 10).map((p) => (
            <li key={p.id} className="flex items-center justify-between text-sm">
              <Link
                href={`/generate?planId=${p.id}&channel=${p.channel}&title=${encodeURIComponent(p.title)}`}
                className="truncate text-ink hover:text-accent-deep hover:underline"
              >
                {p.title}
              </Link>
              <span className="ml-3 shrink-0 text-xs text-muted">
                {clientName(p.client_id)} · {channelLabel(p.channel)} ·{" "}
                {planStatusLabel(p.status)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
