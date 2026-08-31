/**
 * 워크스페이스 비서 챗봇 — 도구 정의·실행기.
 * 실행은 사용자 세션의 Supabase 클라이언트로 → RLS 권한이 그대로 적용된다
 * (예: 세금계산서·리드는 owner 전용 — member가 시도하면 권한 오류를 그대로 안내).
 * 도구 추가는 TOOLS 배열 + executeAssistantTool의 case 하나로 끝.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  taskStatusLabel,
  taskTypeLabel,
} from "@/lib/tasks";
import { EVENT_TYPES, eventTypeLabel } from "@/lib/schedule";

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "add_tax_invoice",
    description:
      "세금계산서 발행 이력을 매출 관리에 등록한다. 사용자가 '세금계산서 발행했어, 등록해줘'라고 하면 사용. 금액이 공급가인지 합계(VAT 포함)인지 명시가 없으면 공급가액으로 간주하고 부가세 10%를 자동 계산한다.",
    input_schema: {
      type: "object",
      properties: {
        issue_date: { type: "string", description: "발행일 YYYY-MM-DD (기본: 오늘)" },
        counterparty: { type: "string", description: "거래처명 (세금계산서 상 상대방, 필수)" },
        end_client_name: { type: "string", description: "실고객명(건명) — 파트너 경유 시 실제 고객 구분" },
        description: { type: "string", description: "적요/품목 (예: 홈페이지 제작 및 SEO 용역)" },
        supply_amount: { type: "integer", description: "공급가액 (원, 필수)" },
        vat_amount: { type: "integer", description: "부가세 (원). 생략 시 공급가액의 10%" },
        deal_channel: { type: "string", enum: ["direct", "referral", "partner"], description: "거래 구분 (기본 direct)" },
        memo: { type: "string", description: "메모" },
      },
      required: ["counterparty", "supply_amount"],
    },
  },
  {
    name: "list_tax_invoices",
    description:
      "등록된 세금계산서 목록을 조회한다 (입금 등록 전 대상 인보이스를 찾을 때, 또는 미수금 확인 요청 시 사용). 각 건의 id·합계·입금액·미수금을 반환한다.",
    input_schema: {
      type: "object",
      properties: {
        counterparty: { type: "string", description: "거래처명 부분 일치 검색 (생략 시 최근 순)" },
        only_unpaid: { type: "boolean", description: "true면 미수금 있는 건만" },
        limit: { type: "integer", description: "최대 건수 (기본 10)" },
      },
    },
  },
  {
    name: "add_invoice_payment",
    description:
      "인보이스에 입금을 등록한다 — 선금/잔금 구분 없이 통장에 들어온 금액을 그대로 누적. 먼저 list_tax_invoices로 대상 인보이스 id를 찾은 뒤 호출한다. 입금 합계가 인보이스 합계에 도달하면 자동으로 입금완료 처리된다.",
    input_schema: {
      type: "object",
      properties: {
        invoice_id: { type: "string", description: "대상 인보이스 id (list_tax_invoices에서 획득, 필수)" },
        amount: { type: "integer", description: "입금액 (통장 기준, 원, 필수)" },
        paid_date: { type: "string", description: "입금일 YYYY-MM-DD (기본: 오늘)" },
        memo: { type: "string", description: "메모" },
      },
      required: ["invoice_id", "amount"],
    },
  },
  {
    name: "add_lead",
    description: "영업 리드를 등록한다 (문의 온 잠재 고객). '어디서 문의 왔어, 리드 등록해줘' 류 요청에 사용.",
    input_schema: {
      type: "object",
      properties: {
        company_name: { type: "string", description: "업체명 (필수)" },
        contact_name: { type: "string", description: "담당자명" },
        phone: { type: "string", description: "연락처" },
        email: { type: "string", description: "이메일" },
        industry: { type: "string", description: "업종 (병의원/법률/학원 등)" },
        region: { type: "string", description: "지역" },
        source: { type: "string", description: "유입경로 (블로그/유튜브/소개 등)" },
        deal_channel: { type: "string", enum: ["direct", "referral", "partner"], description: "거래 구분 (기본 direct)" },
        partner_name: { type: "string", description: "파트너명 또는 소개자 (구분이 direct가 아닐 때)" },
        next_followup: { type: "string", description: "다음 팔로업일 YYYY-MM-DD" },
        memo: { type: "string", description: "메모" },
      },
      required: ["company_name"],
    },
  },
  {
    name: "create_task",
    description:
      "팀 업무(태스크)를 등록한다. '동생한테 ~ 시켜놔', '~ 할 일 추가해줘' 류 요청에 사용. 마감 자연어('금요일까지', '다음 주 초')는 오늘(KST) 기준 YYYY-MM-DD로 변환해 전달할 것.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "업무 제목 (필수)" },
        assignee: { type: "string", description: "'me'(요청자 본인) | 'member'(동생/직원) | 팀원 이름. 생략 시 me" },
        due_date: { type: "string", description: "마감일 YYYY-MM-DD (선택)" },
        client_name: { type: "string", description: "관련 클라이언트명 (선택, 부분 일치로 연결)" },
        task_type: { type: "string", enum: TASK_TYPES.map((t) => t.key), description: "제작(build)/콘텐츠(content)/서무(admin)/응대(support)/운영(ops), 기본 ops" },
        priority: { type: "string", enum: TASK_PRIORITIES.map((p) => p.key), description: "우선순위 (기본 normal)" },
        memo: { type: "string", description: "메모" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_tasks",
    description:
      "팀 업무 목록을 조회한다. '내 업무 뭐 있어?', '동생 이번 주 할 일 알려줘' 류 요청과, 상태 변경 전 대상 업무 id를 찾을 때 사용.",
    input_schema: {
      type: "object",
      properties: {
        assignee: { type: "string", description: "'me' | 'member' | 'all'(기본) | 팀원 이름" },
        status: { type: "string", description: "'open'(미완료, 기본) | 'all' | todo/in_progress/review/done" },
        limit: { type: "integer", description: "최대 건수 (기본 15)" },
      },
    },
  },
  {
    name: "update_task_status",
    description:
      "업무 상태를 변경한다. '그 건 끝났어/완료 처리해줘' 류 요청에 사용. 먼저 list_tasks로 대상 업무 id를 확인한 뒤 호출한다.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "대상 업무 id (list_tasks에서 획득, 필수)" },
        status: { type: "string", enum: TASK_STATUSES.map((s) => s.key), description: "변경할 상태 (필수)" },
      },
      required: ["task_id", "status"],
    },
  },
  {
    name: "list_schedule",
    description:
      "일정을 조회한다 — 등록된 일정 + 업무 마감 + 세금계산서 발행일을 함께 보여준다. '다음 주 일정 뭐 있어?' 류 요청에 사용. 자연어 기간은 KST 기준 날짜로 변환해 전달할 것.",
    input_schema: {
      type: "object",
      properties: {
        date_from: { type: "string", description: "조회 시작일 YYYY-MM-DD (기본: 오늘)" },
        date_to: { type: "string", description: "조회 종료일 YYYY-MM-DD (기본: 시작일+7일)" },
      },
    },
  },
  {
    name: "create_event",
    description:
      "일정을 등록한다. '수요일 2시 OO 미팅 잡아줘' 류 요청에 사용. 자연어 날짜·시간은 KST 기준 YYYY-MM-DD, HH:MM으로 변환해 전달할 것.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "일정 제목 (필수)" },
        event_date: { type: "string", description: "날짜 YYYY-MM-DD (필수)" },
        event_time: { type: "string", description: "시간 HH:MM 24시간제 (선택)" },
        event_type: { type: "string", enum: EVENT_TYPES.map((t) => t.key), description: "미팅(meeting)/마감(deadline)/발행(publish)/기타(etc), 기본 meeting" },
        client_name: { type: "string", description: "관련 클라이언트명 (선택, 부분 일치로 연결)" },
        assignee: { type: "string", description: "'me' | 'member' | 팀원 이름 (선택)" },
        memo: { type: "string", description: "메모" },
      },
      required: ["title", "event_date"],
    },
  },
  {
    name: "get_revenue_summary",
    description:
      "월별 매출 요약을 조회한다 — 해당 월 세금계산서 발행 합계, 입금 합계, 현재 전체 미수금. owner 전용 (member 요청 시 권한 안내).",
    input_schema: {
      type: "object",
      properties: {
        month: { type: "string", description: "조회 월 YYYY-MM (기본: 이번 달)" },
      },
    },
  },
];

function kstToday(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

const wonFmt = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];
const dowOf = (ymd: string) => DOW_KO[new Date(`${ymd}T00:00:00+09:00`).getUTCDay()] ?? "";

/** '동생/직원'(member)·'나'(요청자)·팀원 이름 → 프로필 해석 */
async function resolveAssignee(
  supabase: SupabaseClient,
  userId: string,
  raw: unknown,
): Promise<{ id: string | null; name: string } | { error: string }> {
  const v = String(raw ?? "").trim();
  if (!v) return { id: null, name: "미지정" };
  if (v === "me") {
    const { data } = await supabase.from("profiles").select("name").eq("id", userId).single();
    return { id: userId, name: data?.name ?? "나" };
  }
  if (v === "member") {
    const { data } = await supabase.from("profiles").select("id, name").eq("role", "member").limit(1);
    if (!data?.length) return { error: "member 프로필이 아직 없습니다. 담당 없이 등록하려면 assignee를 비워주세요." };
    return { id: data[0].id, name: data[0].name };
  }
  const { data } = await supabase.from("profiles").select("id, name").ilike("name", `%${v}%`).limit(1);
  if (!data?.length) return { error: `'${v}' 이름의 팀원을 찾지 못했습니다.` };
  return { id: data[0].id, name: data[0].name };
}

/** 클라이언트명 부분 일치 → id. 못 찾으면 연결 없이 진행 (note로 알림) */
async function resolveClient(
  supabase: SupabaseClient,
  raw: unknown,
): Promise<{ id: string | null; name: string | null; note: string }> {
  const v = String(raw ?? "").trim();
  if (!v) return { id: null, name: null, note: "" };
  const { data } = await supabase.from("clients").select("id, name").ilike("name", `%${v}%`).limit(1);
  if (!data?.length) return { id: null, name: null, note: ` (클라이언트 '${v}'를 못 찾아 연결 없이 등록)` };
  return { id: data[0].id, name: data[0].name, note: "" };
}

/** 도구 실행 — 결과는 모델이 읽는 한국어 요약 문자열(JSON) */
export async function executeAssistantTool(
  supabase: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
  ctx: { userId: string },
): Promise<{ ok: boolean; result: string }> {
  try {
    switch (name) {
      case "add_tax_invoice": {
        const supply = Number(input.supply_amount) || 0;
        if (!input.counterparty || supply <= 0) {
          return { ok: false, result: "거래처명과 공급가액이 필요합니다." };
        }
        const vat = input.vat_amount != null ? Number(input.vat_amount) : Math.round(supply * 0.1);
        const row = {
          issue_date: (input.issue_date as string) || kstToday(),
          counterparty: String(input.counterparty).trim(),
          end_client_name: (input.end_client_name as string) || null,
          description: (input.description as string) || null,
          supply_amount: supply,
          vat_amount: vat,
          total_amount: supply + vat,
          deal_channel: (input.deal_channel as string) || "direct",
          memo: (input.memo as string) || null,
        };
        const { error } = await supabase.from("tax_invoices").insert(row);
        if (error) return { ok: false, result: `등록 실패: ${error.message}` };
        return {
          ok: true,
          result: `세금계산서 등록 완료 — ${row.issue_date} ${row.counterparty}${row.end_client_name ? `(건명: ${row.end_client_name})` : ""}, 공급가 ${wonFmt(supply)} + 부가세 ${wonFmt(vat)} = 합계 ${wonFmt(supply + vat)}. 매출 메뉴에서 확인 가능.`,
        };
      }
      case "list_tax_invoices": {
        let q = supabase
          .from("tax_invoices")
          .select("id, issue_date, counterparty, end_client_name, total_amount, status")
          .neq("status", "cancelled")
          .order("issue_date", { ascending: false })
          .limit(Math.min(Number(input.limit) || 10, 30));
        if (input.counterparty) q = q.ilike("counterparty", `%${String(input.counterparty).trim()}%`);
        const { data, error } = await q;
        if (error) return { ok: false, result: `조회 실패: ${error.message}` };
        const invoices = data ?? [];
        if (!invoices.length) return { ok: true, result: "해당하는 세금계산서가 없습니다." };
        const ids = invoices.map((i) => i.id);
        const { data: pays } = await supabase
          .from("invoice_payments")
          .select("invoice_id, amount")
          .in("invoice_id", ids);
        const paid = new Map<string, number>();
        for (const p of pays ?? []) {
          paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount));
        }
        const rows = invoices
          .map((i) => {
            const p = paid.get(i.id) ?? 0;
            const remain = Math.max(0, Number(i.total_amount) - p);
            return { ...i, paid: p, remaining: remain };
          })
          .filter((i) => (input.only_unpaid ? i.remaining > 0 : true));
        return {
          ok: true,
          result: rows
            .map(
              (i) =>
                `id=${i.id} | ${i.issue_date} | ${i.counterparty}${i.end_client_name ? `(${i.end_client_name})` : ""} | 합계 ${wonFmt(Number(i.total_amount))} | 입금 ${wonFmt(i.paid)} | 미수 ${wonFmt(i.remaining)}`,
            )
            .join("\n") || "미수 건이 없습니다.",
        };
      }
      case "add_invoice_payment": {
        const amount = Number(input.amount) || 0;
        const invoiceId = String(input.invoice_id || "");
        if (!invoiceId || amount <= 0) return { ok: false, result: "invoice_id와 입금액이 필요합니다." };
        const { data: inv, error: invErr } = await supabase
          .from("tax_invoices")
          .select("id, counterparty, total_amount, status")
          .eq("id", invoiceId)
          .single();
        if (invErr || !inv) return { ok: false, result: "해당 인보이스를 찾을 수 없습니다." };
        const paidDate = (input.paid_date as string) || kstToday();
        const { error } = await supabase.from("invoice_payments").insert({
          invoice_id: invoiceId,
          paid_date: paidDate,
          amount,
          kind: "other", // 선금/잔금 구분 없이 누적 (스키마 호환용 고정값)
          memo: (input.memo as string) || null,
        });
        if (error) return { ok: false, result: `입금 등록 실패: ${error.message}` };
        const { data: pays } = await supabase
          .from("invoice_payments")
          .select("amount")
          .eq("invoice_id", invoiceId);
        const totalPaid = (pays ?? []).reduce((s, p) => s + Number(p.amount), 0);
        const remaining = Math.max(0, Number(inv.total_amount) - totalPaid);
        if (remaining === 0 && inv.status !== "paid") {
          await supabase
            .from("tax_invoices")
            .update({ status: "paid", paid_at: paidDate, updated_at: new Date().toISOString() })
            .eq("id", invoiceId);
        }
        return {
          ok: true,
          result: `입금 등록 완료 — ${inv.counterparty}에 ${wonFmt(amount)} (${paidDate}). 누적 입금 ${wonFmt(totalPaid)}, 남은 미수 ${wonFmt(remaining)}${remaining === 0 ? " → 완납 처리됨" : ""}.`,
        };
      }
      case "add_lead": {
        if (!input.company_name) return { ok: false, result: "업체명이 필요합니다." };
        const row = {
          company_name: String(input.company_name).trim(),
          contact_name: (input.contact_name as string) || null,
          phone: (input.phone as string) || null,
          email: (input.email as string) || null,
          industry: (input.industry as string) || null,
          region: (input.region as string) || null,
          source: (input.source as string) || null,
          deal_channel: (input.deal_channel as string) || "direct",
          partner_name: (input.partner_name as string) || null,
          next_followup: (input.next_followup as string) || null,
          memo: (input.memo as string) || null,
        };
        const { error } = await supabase.from("leads").insert(row);
        if (error) return { ok: false, result: `리드 등록 실패: ${error.message}` };
        return {
          ok: true,
          result: `리드 등록 완료 — ${row.company_name}${row.industry ? ` (${row.industry})` : ""}${row.next_followup ? `, 팔로업 ${row.next_followup}` : ""}. 영업·리드 메뉴에서 확인 가능.`,
        };
      }
      case "create_task": {
        if (!input.title) return { ok: false, result: "업무 제목이 필요합니다." };
        const assignee = await resolveAssignee(supabase, ctx.userId, input.assignee ?? "me");
        if ("error" in assignee) return { ok: false, result: assignee.error };
        const client = await resolveClient(supabase, input.client_name);
        const row = {
          title: String(input.title).trim(),
          client_id: client.id,
          assignee_id: assignee.id,
          due_date: (input.due_date as string) || null,
          status: "todo",
          task_type: (input.task_type as string) || "ops",
          priority: (input.priority as string) || "normal",
          memo: (input.memo as string) || null,
          created_by: ctx.userId,
        };
        const { error } = await supabase.from("tasks").insert(row);
        if (error) return { ok: false, result: `업무 등록 실패: ${error.message}` };
        return {
          ok: true,
          result: `업무 등록 완료 — "${row.title}" (담당 ${assignee.name}${row.due_date ? `, 마감 ${row.due_date}` : ""}${client.name ? `, ${client.name}` : ""})${client.note}. 업무 메뉴에서 확인 가능.`,
        };
      }
      case "list_tasks": {
        const statusIn = String(input.status ?? "open");
        let q = supabase
          .from("tasks")
          .select("id, title, status, due_date, assignee_id, client_id, priority")
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(Math.min(Number(input.limit) || 15, 30));
        if (statusIn === "open") q = q.neq("status", "done");
        else if (statusIn !== "all") q = q.eq("status", statusIn);
        const assigneeIn = String(input.assignee ?? "all");
        if (assigneeIn !== "all") {
          const a = await resolveAssignee(supabase, ctx.userId, assigneeIn);
          if ("error" in a) return { ok: false, result: a.error };
          if (a.id) q = q.eq("assignee_id", a.id);
        }
        const { data, error } = await q;
        if (error) return { ok: false, result: `조회 실패: ${error.message}` };
        if (!data?.length) return { ok: true, result: "해당하는 업무가 없습니다." };
        const { data: profs } = await supabase.from("profiles").select("id, name");
        const { data: cls } = await supabase.from("clients").select("id, name");
        const pName = new Map((profs ?? []).map((p) => [p.id, p.name]));
        const cName = new Map((cls ?? []).map((c) => [c.id, c.name]));
        return {
          ok: true,
          result: data
            .map(
              (t) =>
                `id=${t.id} | ${t.title} | 담당 ${t.assignee_id ? (pName.get(t.assignee_id) ?? "-") : "미지정"} | ${taskStatusLabel(t.status)}${t.due_date ? ` | 마감 ${t.due_date}(${dowOf(t.due_date)})` : ""}${t.client_id ? ` | ${cName.get(t.client_id) ?? ""}` : ""}${t.priority === "high" ? " | 우선순위 높음" : ""}`,
            )
            .join("\n"),
        };
      }
      case "update_task_status": {
        const taskId = String(input.task_id || "");
        const status = String(input.status || "");
        if (!taskId || !status) return { ok: false, result: "task_id와 status가 필요합니다." };
        const { data: task, error: tErr } = await supabase
          .from("tasks")
          .select("id, title")
          .eq("id", taskId)
          .single();
        if (tErr || !task) return { ok: false, result: "해당 업무를 찾을 수 없습니다." };
        const { error } = await supabase
          .from("tasks")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", taskId);
        if (error) return { ok: false, result: `상태 변경 실패: ${error.message}` };
        return { ok: true, result: `상태 변경 완료 — "${task.title}" → ${taskStatusLabel(status)}.` };
      }
      case "list_schedule": {
        const from = (input.date_from as string) || kstToday();
        const to =
          (input.date_to as string) ||
          new Date(new Date(`${from}T00:00:00+09:00`).getTime() + 7 * 86_400_000)
            .toISOString()
            .slice(0, 10);
        const [evRes, taskRes, invRes, profs] = await Promise.all([
          supabase.from("events").select("*").gte("event_date", from).lte("event_date", to).order("event_date"),
          supabase
            .from("tasks")
            .select("title, due_date, assignee_id, status")
            .gte("due_date", from)
            .lte("due_date", to)
            .neq("status", "done"),
          supabase.from("tax_invoices").select("counterparty, issue_date").gte("issue_date", from).lte("issue_date", to).neq("status", "cancelled"),
          supabase.from("profiles").select("id, name"),
        ]);
        const pName = new Map((profs.data ?? []).map((p) => [p.id, p.name]));
        const lines: { date: string; time: string; text: string }[] = [];
        for (const e of evRes.data ?? []) {
          lines.push({
            date: e.event_date,
            time: e.event_time ? e.event_time.slice(0, 5) : "",
            text: `[일정·${eventTypeLabel(e.event_type)}] ${e.event_time ? `${e.event_time.slice(0, 5)} ` : ""}${e.title}${e.assignee_id ? ` (${pName.get(e.assignee_id) ?? ""})` : ""}`,
          });
        }
        for (const t of taskRes.data ?? []) {
          lines.push({
            date: t.due_date as string,
            time: "98",
            text: `[업무 마감] ${t.title}${t.assignee_id ? ` (담당 ${pName.get(t.assignee_id) ?? ""})` : ""}`,
          });
        }
        for (const inv of invRes.data ?? []) {
          lines.push({ date: inv.issue_date, time: "99", text: `[세금계산서] ${inv.counterparty} 발행일` });
        }
        if (!lines.length) return { ok: true, result: `${from} ~ ${to} 사이 일정이 없습니다.` };
        lines.sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
        return {
          ok: true,
          result: lines.map((l) => `${l.date}(${dowOf(l.date)}) ${l.text}`).join("\n"),
        };
      }
      case "create_event": {
        if (!input.title || !input.event_date) {
          return { ok: false, result: "일정 제목과 날짜가 필요합니다." };
        }
        const assignee = await resolveAssignee(supabase, ctx.userId, input.assignee);
        if ("error" in assignee) return { ok: false, result: assignee.error };
        const client = await resolveClient(supabase, input.client_name);
        const row = {
          title: String(input.title).trim(),
          event_date: String(input.event_date),
          event_time: (input.event_time as string) || null,
          event_type: (input.event_type as string) || "meeting",
          client_id: client.id,
          assignee_id: assignee.id,
          memo: (input.memo as string) || null,
          created_by: ctx.userId,
        };
        const { error } = await supabase.from("events").insert(row);
        if (error) return { ok: false, result: `일정 등록 실패: ${error.message}` };
        return {
          ok: true,
          result: `일정 등록 완료 — ${row.event_date}(${dowOf(row.event_date)})${row.event_time ? ` ${row.event_time}` : ""} "${row.title}" (${eventTypeLabel(row.event_type)})${client.note}. 스케줄 메뉴에서 확인 가능.`,
        };
      }
      case "get_revenue_summary": {
        // owner 전용 — RLS로도 차단되지만, member에게는 명확한 권한 안내를 준다
        const { data: prof } = await supabase.from("profiles").select("role").eq("id", ctx.userId).single();
        if (prof?.role !== "owner") {
          return { ok: false, result: "매출 요약은 owner 전용입니다." };
        }
        const month = (input.month as string) || kstToday().slice(0, 7);
        const start = `${month}-01`;
        const [y, m] = month.split("-").map(Number);
        const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // 다음 달 1일
        const [invRes, payRes, allInvRes, allPayRes] = await Promise.all([
          supabase
            .from("tax_invoices")
            .select("supply_amount, vat_amount, total_amount")
            .gte("issue_date", start)
            .lt("issue_date", end)
            .neq("status", "cancelled"),
          supabase.from("invoice_payments").select("amount").gte("paid_date", start).lt("paid_date", end),
          supabase.from("tax_invoices").select("total_amount").neq("status", "cancelled"),
          supabase.from("invoice_payments").select("amount"),
        ]);
        const inv = invRes.data ?? [];
        const supply = inv.reduce((s, i) => s + Number(i.supply_amount), 0);
        const total = inv.reduce((s, i) => s + Number(i.total_amount), 0);
        const paidMonth = (payRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
        const allTotal = (allInvRes.data ?? []).reduce((s, i) => s + Number(i.total_amount), 0);
        const allPaid = (allPayRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
        return {
          ok: true,
          result: `${month} 매출 요약 — 발행 ${inv.length}건: 공급가 ${wonFmt(supply)}, 합계 ${wonFmt(total)} · 이 달 입금 ${wonFmt(paidMonth)} · 현재 전체 미수금 ${wonFmt(Math.max(0, allTotal - allPaid))}.`,
        };
      }
      default:
        return { ok: false, result: `알 수 없는 도구: ${name}` };
    }
  } catch (e) {
    return { ok: false, result: e instanceof Error ? e.message : "도구 실행 오류" };
  }
}
