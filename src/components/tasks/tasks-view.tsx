"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  taskPriorityDef,
  taskTypeLabel,
} from "@/lib/tasks";
import { TemplateSection } from "@/components/tasks/template-section";
import type { ClientService, Task, TaskTemplate } from "@/types/database";

const input =
  "rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent-deep";

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ViewMode = "list" | "kanban" | "templates";

interface TaskDraft {
  title: string;
  client_id: string;
  assignee_id: string;
  due_date: string;
  task_type: string;
  priority: string;
  memo: string;
}

/**
 * 업무 보드 — 목록/칸반(드래그로 상태 변경)/반복 업무 템플릿.
 * 기본 필터는 "내 업무(미완료)". CRUD는 브라우저 클라이언트로 직접 — RLS가 권한을 강제한다.
 */
export function TasksView({
  me,
  initialTasks,
  profiles,
  clients,
  initialTemplates,
  services,
}: {
  me: { id: string; role: string };
  initialTasks: Task[];
  profiles: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  initialTemplates: TaskTemplate[];
  services: ClientService[];
}) {
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [view, setView] = useState<ViewMode>("list");
  const [fAssignee, setFAssignee] = useState<string>(me.id);
  const [fStatus, setFStatus] = useState<string>("open");
  const [fClient, setFClient] = useState<string>("all");
  const [msg, setMsg] = useState("");

  const emptyDraft: TaskDraft = {
    title: "",
    client_id: "",
    assignee_id: me.id,
    due_date: "",
    task_type: "ops",
    priority: "normal",
    memo: "",
  };
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const today = todayYmd();
  const nameOf = (id: string | null) =>
    id ? (profiles.find((p) => p.id === id)?.name ?? "-") : "미지정";
  const clientNameOf = (id: string | null) =>
    id ? (clients.find((c) => c.id === id)?.name ?? "-") : "";

  async function refetch() {
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (data) setTasks(data as Task[]);
  }

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (fAssignee === "all" || t.assignee_id === fAssignee) &&
          (fClient === "all" || t.client_id === fClient) &&
          (view === "kanban" ||
            fStatus === "all" ||
            (fStatus === "open" ? t.status !== "done" : t.status === fStatus)),
      ),
    [tasks, fAssignee, fStatus, fClient, view],
  );

  async function saveTask() {
    if (!draft.title.trim()) {
      setMsg("제목을 입력하세요.");
      return;
    }
    setBusy(true);
    setMsg("");
    const row = {
      title: draft.title.trim(),
      client_id: draft.client_id || null,
      assignee_id: draft.assignee_id || null,
      due_date: draft.due_date || null,
      task_type: draft.task_type,
      priority: draft.priority,
      memo: draft.memo.trim() || null,
    };
    const { error } = editingId
      ? await supabase
          .from("tasks")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", editingId)
      : await supabase
          .from("tasks")
          .insert({ ...row, status: "todo", created_by: me.id });
    setBusy(false);
    if (error) {
      setMsg(`저장 실패: ${error.message}`);
      return;
    }
    setDraft(emptyDraft);
    setEditingId(null);
    setFormOpen(false);
    await refetch();
  }

  async function changeStatus(id: string, status: string) {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    const { error } = await supabase
      .from("tasks")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setTasks(prev);
      setMsg(`상태 변경 실패: ${error.message}`);
    }
  }

  async function removeTask(id: string) {
    if (!confirm("이 업무를 삭제할까요?")) return;
    const { data, error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
      .select("id");
    if (error || !data?.length) {
      setMsg(
        `삭제 실패: ${error?.message ?? "본인이 만든 업무 또는 owner만 삭제할 수 있습니다."}`,
      );
      return;
    }
    setTasks((ts) => ts.filter((t) => t.id !== id));
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    setDraft({
      title: t.title,
      client_id: t.client_id ?? "",
      assignee_id: t.assignee_id ?? "",
      due_date: t.due_date ?? "",
      task_type: t.task_type,
      priority: t.priority,
      memo: t.memo ?? "",
    });
    setFormOpen(true);
  }

  const overdue = (t: Task) =>
    !!t.due_date && t.due_date < today && t.status !== "done";

  const dueLabel = (t: Task) =>
    t.due_date ? (t.due_date === today ? "오늘" : t.due_date.slice(5).replace("-", "/")) : "";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">업무</h1>
          <p className="mt-1 text-sm text-muted">
            팀 업무 보드 — 담당·마감·상태를 공유합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-surface p-0.5 text-sm">
            {(
              [
                { key: "list", label: "목록" },
                { key: "kanban", label: "칸반" },
                { key: "templates", label: "반복 업무" },
              ] as { key: ViewMode; label: string }[]
            ).map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={[
                  "rounded px-3 py-1 font-medium transition-colors",
                  view === v.key
                    ? "bg-tint text-accent-deep"
                    : "text-muted hover:text-ink",
                ].join(" ")}
              >
                {v.label}
              </button>
            ))}
          </div>
          {view !== "templates" && (
            <button
              onClick={() => {
                setEditingId(null);
                setDraft(emptyDraft);
                setFormOpen((o) => !o);
              }}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:opacity-90"
            >
              + 새 업무
            </button>
          )}
        </div>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      {view === "templates" ? (
        <TemplateSection
          meId={me.id}
          initialTemplates={initialTemplates}
          services={services}
          clients={clients}
          profiles={profiles}
        />
      ) : (
        <>
          {/* 새 업무 / 수정 폼 */}
          {formOpen && (
            <section className="rounded-lg border border-accent-deep/30 bg-tint/30 p-4">
              <h2 className="mb-3 text-sm font-semibold text-ink">
                {editingId ? "업무 수정" : "새 업무"}
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  className={`${input} sm:col-span-2`}
                  placeholder="업무 제목"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
                <select
                  className={input}
                  value={draft.client_id}
                  onChange={(e) => setDraft({ ...draft, client_id: e.target.value })}
                >
                  <option value="">클라이언트 없음</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className={input}
                  value={draft.assignee_id}
                  onChange={(e) =>
                    setDraft({ ...draft, assignee_id: e.target.value })
                  }
                >
                  <option value="">담당 미지정</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.id === me.id ? " (나)" : ""}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className={input}
                  value={draft.due_date}
                  onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
                />
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
                      우선순위 {p.label}
                    </option>
                  ))}
                </select>
                <input
                  className={input}
                  placeholder="메모 (선택)"
                  value={draft.memo}
                  onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={saveTask}
                  disabled={busy}
                  className="rounded-md bg-accent-deep px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "저장 중…" : editingId ? "수정 저장" : "등록"}
                </button>
                <button
                  onClick={() => {
                    setFormOpen(false);
                    setEditingId(null);
                    setDraft(emptyDraft);
                  }}
                  className="rounded-md border border-border px-4 py-1.5 text-sm text-muted hover:text-ink"
                >
                  취소
                </button>
              </div>
            </section>
          )}

          {/* 필터 */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={input}
              value={fAssignee}
              onChange={(e) => setFAssignee(e.target.value)}
            >
              <option value="all">담당자 전체</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === me.id ? " (나)" : ""}
                </option>
              ))}
            </select>
            {view === "list" && (
              <select
                className={input}
                value={fStatus}
                onChange={(e) => setFStatus(e.target.value)}
              >
                <option value="open">미완료</option>
                <option value="all">상태 전체</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            <select
              className={input}
              value={fClient}
              onChange={(e) => setFClient(e.target.value)}
            >
              <option value="all">클라이언트 전체</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">{filtered.length}건</span>
          </div>

          {view === "list" ? (
            <section className="overflow-x-auto rounded-lg border border-border bg-surface">
              {filtered.length === 0 ? (
                <p className="p-6 text-sm text-muted">
                  표시할 업무가 없습니다. 새 업무를 등록해보세요.
                </p>
              ) : (
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="px-3 py-2 font-medium">상태</th>
                      <th className="px-3 py-2 font-medium">업무</th>
                      <th className="px-3 py-2 font-medium">유형</th>
                      <th className="px-3 py-2 font-medium">클라이언트</th>
                      <th className="px-3 py-2 font-medium">담당</th>
                      <th className="px-3 py-2 font-medium">마감</th>
                      <th className="px-3 py-2 font-medium">우선순위</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr key={t.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">
                          <select
                            className="rounded border border-border bg-surface px-1.5 py-1 text-xs outline-none focus:border-accent-deep"
                            value={t.status}
                            onChange={(e) => changeStatus(t.id, e.target.value)}
                          >
                            {TASK_STATUSES.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <p
                            className={[
                              "font-medium",
                              t.status === "done" ? "text-muted line-through" : "text-ink",
                            ].join(" ")}
                          >
                            {t.title}
                            {t.template_id && (
                              <span className="ml-1.5 rounded bg-subtle px-1 py-0.5 text-[10px] text-muted">
                                반복
                              </span>
                            )}
                          </p>
                          {t.memo && (
                            <p className="mt-0.5 text-xs text-muted">{t.memo}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted">
                          {taskTypeLabel(t.task_type)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted">
                          {clientNameOf(t.client_id) || "-"}
                        </td>
                        <td className="px-3 py-2 text-xs text-ink">
                          {nameOf(t.assignee_id)}
                        </td>
                        <td
                          className={[
                            "px-3 py-2 font-mono text-xs",
                            overdue(t) ? "font-semibold text-red-600" : "text-muted",
                          ].join(" ")}
                        >
                          {dueLabel(t) || "-"}
                          {overdue(t) && " (지남)"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={[
                              "rounded px-1.5 py-0.5 text-[11px] font-medium",
                              taskPriorityDef(t.priority)?.badge ?? "bg-subtle text-muted",
                            ].join(" ")}
                          >
                            {taskPriorityDef(t.priority)?.label ?? t.priority}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                          <button
                            onClick={() => startEdit(t)}
                            className="text-muted hover:text-accent-deep"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => removeTask(t.id)}
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
          ) : (
            /* 칸반 — 카드를 드래그해 상태 컬럼으로 이동 */
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              {TASK_STATUSES.map((s) => {
                const cards = filtered.filter((t) => t.status === s.key);
                return (
                  <div
                    key={s.key}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragId) changeStatus(dragId, s.key);
                      setDragId(null);
                    }}
                    className="min-h-[240px] rounded-lg border border-border bg-subtle/50 p-2"
                  >
                    <p
                      className={[
                        "mb-2 rounded px-2 py-1 text-xs font-semibold",
                        s.badge,
                      ].join(" ")}
                    >
                      {s.label} · {cards.length}
                    </p>
                    <div className="space-y-2">
                      {cards.map((t) => (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={() => setDragId(t.id)}
                          onClick={() => startEdit(t)}
                          className="cursor-grab rounded-md border border-border bg-surface p-2.5 shadow-sm hover:border-accent-deep/50"
                        >
                          <p className="text-sm font-medium text-ink">{t.title}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                            {t.priority === "high" && (
                              <span className="rounded bg-red-50 px-1 py-0.5 font-medium text-red-600">
                                높음
                              </span>
                            )}
                            <span>{taskTypeLabel(t.task_type)}</span>
                            {t.client_id && <span>· {clientNameOf(t.client_id)}</span>}
                            <span>· {nameOf(t.assignee_id)}</span>
                            {t.due_date && (
                              <span
                                className={[
                                  "font-mono",
                                  overdue(t) ? "font-semibold text-red-600" : "",
                                ].join(" ")}
                              >
                                · {dueLabel(t)}
                              </span>
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
