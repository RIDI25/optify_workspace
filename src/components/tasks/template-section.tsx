"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { serviceLabel } from "@/lib/services";
import { TASK_PRIORITIES, TASK_TYPES, taskTypeLabel } from "@/lib/tasks";
import type { ClientService, TaskTemplate } from "@/types/database";

const input =
  "rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent-deep";

interface TemplateDraft {
  client_service_id: string;
  title: string;
  assignee_id: string;
  issue_day: string;
  task_type: string;
  priority: string;
}

/**
 * 반복 업무 템플릿 — 월 운영 계약(client_services)에 연결.
 * cron(/api/tasks/cron)이 매월 발행일에 tasks로 자동 발행한다.
 */
export function TemplateSection({
  meId,
  initialTemplates,
  services,
  clients,
  profiles,
}: {
  meId: string;
  initialTemplates: TaskTemplate[];
  services: ClientService[];
  clients: { id: string; name: string }[];
  profiles: { id: string; name: string }[];
}) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<TaskTemplate[]>(initialTemplates);
  const emptyDraft: TemplateDraft = {
    client_service_id: "",
    title: "",
    assignee_id: "",
    issue_day: "1",
    task_type: "content",
    priority: "normal",
  };
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const clientNameOf = (id: string) =>
    clients.find((c) => c.id === id)?.name ?? "-";
  const svcLabel = (id: string) => {
    const s = services.find((x) => x.id === id);
    return s ? `${clientNameOf(s.client_id)} · ${serviceLabel(s.service_type)}` : "-";
  };
  const nameOf = (id: string | null) =>
    id ? (profiles.find((p) => p.id === id)?.name ?? "-") : "미지정";
  // 새 템플릿은 진행중 계약에만 연결 (기존 템플릿의 종료 계약 라벨은 그대로 표시됨)
  const activeServices = services.filter(
    (s) => s.status === "active" || s.status === "paused",
  );

  async function refetch() {
    const { data } = await supabase
      .from("task_templates")
      .select("*")
      .order("created_at");
    if (data) setTemplates(data as TaskTemplate[]);
  }

  async function save() {
    const day = Number(draft.issue_day);
    if (!draft.client_service_id) {
      setMsg("연결할 계약 서비스를 선택하세요.");
      return;
    }
    if (!draft.title.trim()) {
      setMsg("업무 제목을 입력하세요.");
      return;
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      setMsg("발행일은 1~31 사이 숫자여야 합니다.");
      return;
    }
    setBusy(true);
    setMsg("");
    const row = {
      client_service_id: draft.client_service_id,
      title: draft.title.trim(),
      assignee_id: draft.assignee_id || null,
      issue_day: day,
      task_type: draft.task_type,
      priority: draft.priority,
    };
    const { error } = editingId
      ? await supabase
          .from("task_templates")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", editingId)
      : await supabase
          .from("task_templates")
          .insert({ ...row, active: true, created_by: meId });
    setBusy(false);
    if (error) {
      setMsg(`저장 실패: ${error.message}`);
      return;
    }
    setDraft(emptyDraft);
    setEditingId(null);
    await refetch();
  }

  async function toggleActive(t: TaskTemplate) {
    const { error } = await supabase
      .from("task_templates")
      .update({ active: !t.active, updated_at: new Date().toISOString() })
      .eq("id", t.id);
    if (error) {
      setMsg(`변경 실패: ${error.message}`);
      return;
    }
    setTemplates((ts) =>
      ts.map((x) => (x.id === t.id ? { ...x, active: !t.active } : x)),
    );
  }

  async function remove(id: string) {
    if (!confirm("이 반복 업무 템플릿을 삭제할까요? (이미 발행된 업무는 남습니다)")) return;
    const { data, error } = await supabase
      .from("task_templates")
      .delete()
      .eq("id", id)
      .select("id");
    if (error || !data?.length) {
      setMsg(
        `삭제 실패: ${error?.message ?? "본인이 만든 템플릿 또는 owner만 삭제할 수 있습니다."}`,
      );
      return;
    }
    setTemplates((ts) => ts.filter((t) => t.id !== id));
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-accent-deep/30 bg-tint/30 p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink">
          {editingId ? "반복 업무 수정" : "반복 업무 추가"}
        </h2>
        <p className="mb-3 text-xs text-muted">
          월 운영 계약에 연결하면 매월 발행일 새벽에 업무가 자동 등록됩니다. 예:
          매월 1일 &quot;블로그 4건 발행&quot;.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <select
            className={input}
            value={draft.client_service_id}
            onChange={(e) =>
              setDraft({ ...draft, client_service_id: e.target.value })
            }
          >
            <option value="">계약 서비스 선택</option>
            {activeServices.map((s) => (
              <option key={s.id} value={s.id}>
                {svcLabel(s.id)}
              </option>
            ))}
          </select>
          <input
            className={`${input} lg:col-span-2`}
            placeholder="업무 제목 (예: 블로그 4건 발행)"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <select
            className={input}
            value={draft.assignee_id}
            onChange={(e) => setDraft({ ...draft, assignee_id: e.target.value })}
          >
            <option value="">담당 미지정</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === meId ? " (나)" : ""}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted">매월</span>
            <input
              type="number"
              min={1}
              max={31}
              className={`${input} w-20`}
              value={draft.issue_day}
              onChange={(e) => setDraft({ ...draft, issue_day: e.target.value })}
            />
            <span className="text-sm text-muted">일 발행</span>
          </div>
          <div className="flex gap-2">
            <select
              className={input}
              value={draft.task_type}
              onChange={(e) => setDraft({ ...draft, task_type: e.target.value })}
            >
              {TASK_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              className={input}
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="rounded-md bg-accent-deep px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "저장 중…" : editingId ? "수정 저장" : "추가"}
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setDraft(emptyDraft);
              }}
              className="rounded-md border border-border px-4 py-1.5 text-sm text-muted hover:text-ink"
            >
              취소
            </button>
          )}
        </div>
        {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
      </section>

      <section className="overflow-x-auto rounded-lg border border-border bg-surface">
        {templates.length === 0 ? (
          <p className="p-6 text-sm text-muted">
            등록된 반복 업무가 없습니다. 월 운영 계약의 정기 업무를 추가해보세요.
          </p>
        ) : (
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">업무</th>
                <th className="px-3 py-2 font-medium">연결 계약</th>
                <th className="px-3 py-2 font-medium">담당</th>
                <th className="px-3 py-2 font-medium">발행일</th>
                <th className="px-3 py-2 font-medium">유형</th>
                <th className="px-3 py-2 font-medium">최근 발행</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{t.title}</td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {svcLabel(t.client_service_id)}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink">
                    {nameOf(t.assignee_id)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">
                    매월 {t.issue_day}일
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {taskTypeLabel(t.task_type)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">
                    {t.last_issued_ym ?? "-"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleActive(t)}
                      className={[
                        "rounded px-2 py-0.5 text-[11px] font-medium",
                        t.active
                          ? "bg-tint text-accent-deep"
                          : "bg-subtle text-muted",
                      ].join(" ")}
                    >
                      {t.active ? "활성" : "중지"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEditingId(t.id);
                        setDraft({
                          client_service_id: t.client_service_id,
                          title: t.title,
                          assignee_id: t.assignee_id ?? "",
                          issue_day: String(t.issue_day),
                          task_type: t.task_type,
                          priority: t.priority,
                        });
                      }}
                      className="text-muted hover:text-accent-deep"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => remove(t.id)}
                      className="ml-2 text-muted hover:text-red-600"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
