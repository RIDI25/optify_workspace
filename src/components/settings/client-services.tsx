"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  SERVICES,
  SERVICE_STATUS_LABELS,
  daysUntilEnd,
  getService,
  serviceLabel,
} from "@/lib/services";
import { won } from "@/lib/export/quote-model";
import type { ClientService, ServiceStatus } from "@/types/database";

const input =
  "rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent-deep";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1); // 6개월 계약 = 시작일 ~ 6개월 후 전날
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 고객사 상세 — 계약 서비스 관리 (업무 플로우의 기준) */
export function ClientServicesSection({
  clientId,
  readOnly,
}: {
  clientId: string;
  readOnly: boolean;
}) {
  const [services, setServices] = useState<ClientService[]>([]);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState(SERVICES[0].key);
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");
  const [amount, setAmount] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const def = getService(type);

  const reload = useCallback(() => {
    createClient()
      .from("client_services")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setServices((data ?? []) as ClientService[]));
  }, [clientId]);

  useEffect(reload, [reload]);

  // 유형 변경 시 기간제면 종료일 자동 계산 (기본 6개월)
  useEffect(() => {
    if (def?.billing === "period") {
      setEndDate(addMonths(startDate, def.defaultMonths ?? 6));
    } else {
      setEndDate("");
    }
  }, [type, startDate, def]);

  async function add() {
    if (!def) return;
    setBusy(true);
    setMsg("");
    const { error } = await createClient().from("client_services").insert({
      client_id: clientId,
      service_type: type,
      billing: def.billing,
      status: "active",
      start_date: startDate || null,
      end_date: def.billing === "period" ? endDate || null : null,
      amount: def.billing === "one_time" && amount ? Number(amount) : null,
      monthly_fee: def.billing === "period" && monthlyFee ? Number(monthlyFee) : null,
      memo: memo || null,
    });
    setBusy(false);
    if (error) {
      setMsg(`추가 실패: ${error.message}`);
      return;
    }
    setAdding(false);
    setAmount("");
    setMonthlyFee("");
    setMemo("");
    reload();
  }

  async function updateStatus(svc: ClientService, status: ServiceStatus) {
    await createClient()
      .from("client_services")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", svc.id);
    reload();
  }

  async function renew(svc: ClientService) {
    // 재계약: 기존 계약 종료 처리 + 종료일 다음날부터 같은 기간으로 새 계약
    const def = getService(svc.service_type);
    const months = def?.defaultMonths ?? 6;
    const nextStart = svc.end_date
      ? (() => {
          const d = new Date(`${svc.end_date}T00:00:00`);
          d.setDate(d.getDate() + 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        })()
      : today();
    if (!window.confirm(`${serviceLabel(svc.service_type)} 계약을 ${nextStart}부터 ${months}개월 연장할까요?`))
      return;
    const supabase = createClient();
    await supabase
      .from("client_services")
      .update({ status: "ended", updated_at: new Date().toISOString() })
      .eq("id", svc.id);
    await supabase.from("client_services").insert({
      client_id: clientId,
      service_type: svc.service_type,
      billing: svc.billing,
      status: "active",
      start_date: nextStart,
      end_date: addMonths(nextStart, months),
      monthly_fee: svc.monthly_fee,
      memo: "재계약",
    });
    reload();
  }

  async function remove(svc: ClientService) {
    if (!window.confirm(`'${serviceLabel(svc.service_type)}' 계약을 삭제할까요?`)) return;
    await createClient().from("client_services").delete().eq("id", svc.id);
    reload();
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          이 고객사가 계약한 항목입니다. 콘텐츠 화면·대시보드가 이 기준으로 표시됩니다.
        </p>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-red-500">{msg}</span>}
          {!readOnly && (
            <button
              onClick={() => setAdding((v) => !v)}
              className="rounded-md border border-accent-deep px-3 py-1.5 text-sm font-medium text-accent-deep hover:bg-tint"
            >
              {adding ? "닫기" : "+ 계약 추가"}
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="space-y-3 rounded-md bg-subtle p-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">서비스</span>
              <select value={type} onChange={(e) => setType(e.target.value)} className={`w-full ${input}`}>
                {SERVICES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.emoji} {s.label} ({s.billing === "period" ? "기간제" : "일회성"})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">시작일</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`w-full ${input}`} />
            </label>
            {def?.billing === "period" ? (
              <>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted">종료일 (기본 {def.defaultMonths ?? 6}개월)</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`w-full ${input}`} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted">월 비용 (원, 선택)</span>
                  <input type="number" min={0} value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} className={`w-full text-right ${input}`} />
                </label>
              </>
            ) : (
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted">금액 (원, 선택)</span>
                <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={`w-full text-right ${input}`} />
              </label>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모 (선택)"
              className={`flex-1 ${input}`}
            />
            <button
              onClick={add}
              disabled={busy}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "추가 중…" : "계약 추가"}
            </button>
          </div>
        </div>
      )}

      {services.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-5 text-center text-sm text-muted">
          등록된 계약 서비스가 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {services.map((svc) => {
            const d = getService(svc.service_type);
            const days = svc.billing === "period" ? daysUntilEnd(svc.end_date) : null;
            const expiring = svc.status === "active" && days != null && days <= 30;
            return (
              <div
                key={svc.id}
                className={[
                  "flex flex-wrap items-center justify-between gap-2 rounded-md border p-3",
                  expiring ? "border-amber-300 bg-amber-50" : "border-border",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {d?.emoji} {serviceLabel(svc.service_type)}
                    <span className="ml-2 text-xs text-muted">
                      {svc.billing === "period" ? "기간제" : "일회성"}
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    {svc.billing === "period" ? (
                      <>
                        {svc.start_date} ~ {svc.end_date}
                        {days != null && svc.status === "active" && (
                          <b className={expiring ? "ml-1 text-amber-700" : "ml-1"}>
                            {days >= 0 ? ` (D-${days})` : ` (${-days}일 경과)`}
                          </b>
                        )}
                        {svc.monthly_fee ? ` · 월 ${won(Number(svc.monthly_fee))}` : ""}
                      </>
                    ) : (
                      <>
                        {svc.start_date ?? ""}
                        {svc.amount ? ` · ${won(Number(svc.amount))}` : ""}
                      </>
                    )}
                    {svc.memo && ` · ${svc.memo}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {!readOnly && svc.billing === "period" && svc.status === "active" && (
                    <button
                      onClick={() => renew(svc)}
                      className="rounded border border-accent-deep px-2 py-1 text-xs font-medium text-accent-deep hover:bg-tint"
                    >
                      재계약
                    </button>
                  )}
                  <select
                    value={svc.status}
                    onChange={(e) => updateStatus(svc, e.target.value as ServiceStatus)}
                    disabled={readOnly}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent-deep disabled:bg-subtle"
                  >
                    {Object.entries(SERVICE_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {!readOnly && (
                    <button
                      onClick={() => remove(svc)}
                      className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-red-500"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
