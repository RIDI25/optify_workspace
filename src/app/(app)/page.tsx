import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { channelLabel } from "@/lib/channels";
import { serviceLabel } from "@/lib/services";
import { kstMonth, monthBoundsUtc, monthContentSummary, type PublishRow } from "@/lib/publish-stats";
import { TrackerSummary } from "@/components/dashboard/tracker-summary";
import { TodayView, type TodayClientSummary, type TodayEvent, type TodayRow } from "@/components/today/today-view";

function kstToday(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmt(ymd: string): string {
  return ymd.slice(5).replace("-", "/");
}
function dueLabel(due: string | null, today: string): { label: string; overdue: boolean } {
  if (!due) return { label: "—", overdue: false };
  if (due < today) {
    const days = Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${due}T00:00:00Z`).getTime()) / 86_400_000);
    return { label: `${fmt(due)} (${days}일 지연)`, overdue: true };
  }
  if (due === today) return { label: "오늘", overdue: false };
  return { label: fmt(due), overdue: false };
}

/**
 * 오늘 — "지금 무엇을 처리해야 하나". 검수·발행·업무·영업·정산·계약을 한 표로 모으고 행마다 다음 행동을 붙인다.
 * (2026-09-06 개편 1차. 2인 모두 같은 권한이라 역할별 화면 구분 없음, '내 담당만' 필터만 둔다)
 */
export default async function TodayPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const today = kstToday();
  const ym = kstMonth(new Date().toISOString())!;
  const { startIso, endIso } = monthBoundsUtc(ym);
  const weekEnd = addDays(today, 7);
  const contractHorizon = addDays(today, 30);

  const [clientsRes, profilesRes, reviewRes, tasksRes, leadsRes, plansRes, invoicesRes, paymentsRes, servicesRes, eventsRes, monthContentsRes, upcomingPlansRes] =
    await Promise.all([
      supabase.from("clients").select("id, name, is_internal, status").order("is_internal", { ascending: false }).order("created_at"),
      supabase.from("profiles").select("id, name"),
      supabase
        .from("contents")
        .select("id, client_id, title, channel, approval_status, created_by, created_at")
        .in("approval_status", ["pending", "rejected"])
        .order("created_at", { ascending: false }),
      supabase.from("tasks").select("id, title, client_id, assignee_id, due_date, status").neq("status", "done").lte("due_date", today).order("due_date"),
      supabase
        .from("leads")
        .select("id, company_name, next_followup, created_by, status")
        .in("status", ["inquiry", "consulting", "quoted"])
        .lte("next_followup", today)
        .order("next_followup"),
      supabase
        .from("content_plans")
        .select("id, client_id, title, channel, scheduled_date, assignee, status")
        .neq("status", "published")
        .lte("scheduled_date", today)
        .order("scheduled_date"),
      supabase.from("tax_invoices").select("id, counterparty, end_client_name, total_amount, issue_date").eq("status", "issued").order("issue_date"),
      supabase.from("invoice_payments").select("invoice_id, amount"),
      supabase.from("client_services").select("id, client_id, service_type, end_date").eq("status", "active").gte("end_date", today).lte("end_date", contractHorizon),
      supabase.from("events").select("id, title, event_date, event_time, event_type, client_id").gte("event_date", today).lte("event_date", weekEnd).order("event_date").order("event_time"),
      supabase
        .from("contents")
        .select("client_id, channel, wp_post_id, published_at, created_at, approval_status")
        .or(`and(created_at.gte.${startIso},created_at.lte.${endIso}),and(published_at.gte.${startIso},published_at.lte.${endIso})`),
      supabase
        .from("content_plans")
        .select("id, client_id, title, channel, scheduled_date")
        .neq("status", "published")
        .gt("scheduled_date", today)
        .lte("scheduled_date", weekEnd)
        .order("scheduled_date"),
    ]);

  type ClientLite = { id: string; name: string; is_internal: boolean; status: string };
  const clients = (clientsRes.data ?? []) as ClientLite[];
  const profiles = (profilesRes.data ?? []) as { id: string; name: string }[];
  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "—";
  const personName = (id: string | null) => profiles.find((p) => p.id === id)?.name ?? "";

  const rows: TodayRow[] = [];

  for (const c of (reviewRes.data ?? []) as { id: string; client_id: string; title: string | null; channel: string; approval_status: string; created_by: string | null }[]) {
    const rejected = c.approval_status === "rejected";
    rows.push({
      key: `review-${c.id}`,
      group: "review",
      clientId: c.client_id,
      clientName: clientName(c.client_id),
      title: `${c.title || "(제목 없음)"} · ${channelLabel(c.channel)}`,
      badge: rejected ? "수정 필요" : "검수 필요",
      tone: rejected ? "bad" : "warn",
      action: { label: rejected ? "수정하기" : "검수하기", href: `/clients/${c.client_id}/content?view=library&contentId=${c.id}` },
      due: null,
      dueLabel: "—",
      assigneeId: c.created_by,
      assignee: personName(c.created_by),
    });
  }

  for (const p of (plansRes.data ?? []) as { id: string; client_id: string; title: string; channel: string; scheduled_date: string | null; assignee: string | null }[]) {
    const d = dueLabel(p.scheduled_date, today);
    rows.push({
      key: `publish-${p.id}`,
      group: "publish",
      clientId: p.client_id,
      clientName: clientName(p.client_id),
      title: `${p.title} · ${channelLabel(p.channel)} 발행 예정`,
      badge: d.overdue ? "지연" : "오늘 발행",
      tone: d.overdue ? "bad" : "info",
      action: { label: "발행 기록", href: `/clients/${p.client_id}/content?view=plans` },
      due: p.scheduled_date,
      dueLabel: d.label,
      assigneeId: p.assignee,
      assignee: personName(p.assignee),
    });
  }

  for (const t of (tasksRes.data ?? []) as { id: string; title: string; client_id: string | null; assignee_id: string | null; due_date: string | null }[]) {
    const d = dueLabel(t.due_date, today);
    rows.push({
      key: `task-${t.id}`,
      group: "task",
      clientId: t.client_id,
      clientName: t.client_id ? clientName(t.client_id) : "옵티파이 내부",
      title: t.title,
      badge: d.overdue ? "지연" : "오늘 마감",
      tone: d.overdue ? "bad" : "info",
      action: { label: "업무 보기", href: "/tasks" },
      due: t.due_date,
      dueLabel: d.label,
      assigneeId: t.assignee_id,
      assignee: personName(t.assignee_id),
    });
  }

  for (const l of (leadsRes.data ?? []) as { id: string; company_name: string; next_followup: string | null; created_by: string | null; status: string }[]) {
    const d = dueLabel(l.next_followup, today);
    rows.push({
      key: `lead-${l.id}`,
      group: "lead",
      clientId: null,
      clientName: l.company_name,
      title: `후속 연락 · ${l.status === "quoted" ? "견적 보냄" : l.status === "consulting" ? "상담 중" : "문의"}`,
      badge: d.overdue ? "지연" : "오늘 연락",
      tone: d.overdue ? "bad" : "info",
      action: { label: "연락 기록", href: "/sales" },
      due: l.next_followup,
      dueLabel: d.label,
      assigneeId: l.created_by,
      assignee: personName(l.created_by),
    });
  }

  const paid = new Map<string, number>();
  for (const p of (paymentsRes.data ?? []) as { invoice_id: string; amount: number }[]) {
    paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount));
  }
  for (const inv of (invoicesRes.data ?? []) as { id: string; counterparty: string; end_client_name: string | null; total_amount: number; issue_date: string }[]) {
    const remaining = Number(inv.total_amount) - (paid.get(inv.id) ?? 0);
    if (remaining <= 0) continue;
    rows.push({
      key: `invoice-${inv.id}`,
      group: "invoice",
      clientId: null,
      clientName: inv.end_client_name ?? inv.counterparty,
      title: `미수금 ${remaining.toLocaleString("ko-KR")}원 (${fmt(inv.issue_date)} 발행)`,
      badge: "약정일 없음",
      tone: "muted",
      action: { label: "입금 기록", href: "/revenue" },
      due: null,
      dueLabel: "약정일 없음",
      assigneeId: null,
      assignee: "",
    });
  }

  for (const s of (servicesRes.data ?? []) as { id: string; client_id: string; service_type: string; end_date: string | null }[]) {
    const d = dueLabel(s.end_date, today);
    rows.push({
      key: `contract-${s.id}`,
      group: "contract",
      clientId: s.client_id,
      clientName: clientName(s.client_id),
      title: `${serviceLabel(s.service_type)} 계약 종료 예정`,
      badge: "재계약 논의",
      tone: "warn",
      action: { label: "계약 보기", href: `/clients/${s.client_id}/info` },
      due: s.end_date,
      dueLabel: d.label,
      assigneeId: null,
      assignee: "",
    });
  }

  const toneRank: Record<string, number> = { bad: 0, warn: 1, info: 2, muted: 3 };
  rows.sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || (a.due ?? "9999").localeCompare(b.due ?? "9999"));

  const events: TodayEvent[] = [
    ...((eventsRes.data ?? []) as { id: string; title: string; event_date: string; event_time: string | null; event_type: string; client_id: string | null }[]).map((e) => ({
      key: `e-${e.id}`,
      date: e.event_date,
      time: e.event_time,
      title: e.client_id ? `${clientName(e.client_id)} · ${e.title}` : e.title,
      kind: e.event_type === "meeting" ? "미팅" : e.event_type === "deadline" ? "마감" : e.event_type === "publish" ? "발행" : "일정",
    })),
    ...((upcomingPlansRes.data ?? []) as { id: string; client_id: string; title: string; channel: string; scheduled_date: string }[]).map((p) => ({
      key: `p-${p.id}`,
      date: p.scheduled_date,
      time: null,
      title: `${clientName(p.client_id)} · ${p.title}`,
      kind: `${channelLabel(p.channel)} 발행`,
    })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
    .slice(0, 8);

  const monthContents = (monthContentsRes.data ?? []) as (PublishRow & { client_id: string; approval_status: string })[];
  const overdueByClient = new Map<string, number>();
  for (const r of rows) if (r.tone === "bad" && r.clientId) overdueByClient.set(r.clientId, (overdueByClient.get(r.clientId) ?? 0) + 1);
  const clientSummaries: TodayClientSummary[] = clients
    .filter((c) => c.status === "active")
    .map((c) => {
      const mine = monthContents.filter((x) => x.client_id === c.id);
      const s = monthContentSummary(mine, ym);
      return {
        id: c.id,
        name: c.name,
        isInternal: c.is_internal,
        generated: s.total,
        published: s.published,
        pending: rows.filter((r) => r.group === "review" && r.clientId === c.id).length,
        overdue: overdueByClient.get(c.id) ?? 0,
      };
    });

  return (
    <div className="space-y-6">
      <TodayView rows={rows} events={events} clients={clientSummaries} me={{ id: profile.id, name: profile.name }} today={today} ym={ym} />
      <div className="mx-auto max-w-6xl">
        <TrackerSummary />
      </div>
    </div>
  );
}
