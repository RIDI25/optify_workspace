import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { channelLabel } from "@/lib/channels";
import { planStatusLabel } from "@/lib/plan-status";
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

  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">대시보드</h1>
        <p className="mt-1 text-sm text-muted">
          {profile.name}님 · {monthLabel}
        </p>
      </div>

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
