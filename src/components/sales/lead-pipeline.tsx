"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { convertLeadToClient } from "@/lib/actions/leads";
import { DEAL_CHANNELS, dealGroupLabel } from "@/lib/deal-channels";
import { won } from "@/lib/export/quote-model";
import type { DealChannel, Lead, LeadStatus, Quote } from "@/types/database";

const STATUS_LABELS: Record<LeadStatus, string> = {
  inquiry: "문의",
  consulting: "상담",
  quoted: "견적",
  won: "수주",
  lost: "실패",
};

const input =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent-deep";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EMPTY_FORM = {
  company_name: "",
  contact_name: "",
  phone: "",
  email: "",
  industry: "",
  region: "",
  source: "",
  deal_channel: "direct" as DealChannel,
  partner_name: "",
  next_followup: "",
  memo: "",
};

export function LeadPipeline({
  leads,
  quotes,
  onChanged,
}: {
  leads: Lead[];
  quotes: Quote[];
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const followupDue = leads.filter(
    (l) => l.next_followup && l.next_followup <= today() && !["won", "lost"].includes(l.status),
  );

  async function addLead() {
    if (!form.company_name.trim()) {
      setMsg("업체명을 입력하세요.");
      return;
    }
    setBusy("add");
    setMsg("");
    const supabase = createClient();
    const { error } = await supabase.from("leads").insert({
      company_name: form.company_name.trim(),
      contact_name: form.contact_name || null,
      phone: form.phone || null,
      email: form.email || null,
      industry: form.industry || null,
      region: form.region || null,
      source: form.source || null,
      deal_channel: form.deal_channel,
      partner_name: form.deal_channel === "direct" ? null : form.partner_name || null,
      next_followup: form.next_followup || null,
      memo: form.memo || null,
    });
    setBusy("");
    if (error) {
      setMsg(`추가 실패: ${error.message}`);
      return;
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    onChanged();
  }

  async function updateLead(id: string, patch: Partial<Lead>) {
    const supabase = createClient();
    await supabase
      .from("leads")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    onChanged();
  }

  async function removeLead(lead: Lead) {
    if (!window.confirm(`'${lead.company_name}' 리드를 삭제할까요?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) setMsg(`삭제 실패: ${error.message}`);
    else onChanged();
  }

  async function convert(lead: Lead) {
    if (!window.confirm(`'${lead.company_name}'을(를) 클라이언트로 전환할까요?\n온보딩 태스크가 자동 발급됩니다.`))
      return;
    setBusy(lead.id);
    const res = await convertLeadToClient(lead.id);
    setBusy("");
    if (!res.ok) setMsg(`전환 실패: ${res.error}`);
    else {
      setMsg(`'${lead.company_name}' 클라이언트 전환 완료 — 온보딩 태스크 발급됨`);
      onChanged();
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">
          리드 파이프라인
          {followupDue.length > 0 && (
            <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
              팔로업 {followupDue.length}건
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-muted">{msg}</span>}
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md border border-accent-deep px-3 py-1.5 text-sm font-medium text-accent-deep hover:bg-tint"
          >
            {showForm ? "닫기" : "+ 리드 추가"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-md bg-subtle p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <input value={form.company_name} onChange={set("company_name")} placeholder="업체명 *" className={input} />
            <input value={form.contact_name} onChange={set("contact_name")} placeholder="담당자" className={input} />
            <input value={form.phone} onChange={set("phone")} placeholder="연락처" className={input} />
            <input value={form.email} onChange={set("email")} placeholder="이메일" className={input} />
            <input value={form.industry} onChange={set("industry")} placeholder="업종 (병의원/법률/학원…)" className={input} />
            <input value={form.region} onChange={set("region")} placeholder="지역" className={input} />
            <input value={form.source} onChange={set("source")} placeholder="유입경로 (블로그/유튜브/소개…)" className={input} />
            <select
              value={form.deal_channel}
              onChange={(e) => setForm((f) => ({ ...f, deal_channel: e.target.value as DealChannel }))}
              className={input}
              title="거래 구분"
            >
              {DEAL_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  거래: {c.label}
                </option>
              ))}
            </select>
            {form.deal_channel !== "direct" && (
              <input
                value={form.partner_name}
                onChange={set("partner_name")}
                placeholder={form.deal_channel === "partner" ? "파트너명 (세금계산서 거래처)" : "소개자"}
                list="partner-names"
                className={input}
              />
            )}
            <input type="date" value={form.next_followup} onChange={set("next_followup")} title="다음 팔로업일" className={input} />
            <input value={form.memo} onChange={set("memo")} placeholder="메모" className={input} />
          </div>
          <datalist id="partner-names">
            {[...new Set(leads.map((l) => l.partner_name).filter(Boolean))].map((name) => (
              <option key={name!} value={name!} />
            ))}
          </datalist>
          <button
            onClick={addLead}
            disabled={busy === "add"}
            className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
          >
            {busy === "add" ? "추가 중…" : "리드 추가"}
          </button>
        </div>
      )}

      {leads.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted">
          등록된 리드가 없습니다. 첫 문의가 오면 여기에 기록하세요.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">업체명</th>
                <th className="py-2 pr-3 font-medium">구분</th>
                <th className="py-2 pr-3 font-medium">업종·지역</th>
                <th className="py-2 pr-3 font-medium">유입경로</th>
                <th className="py-2 pr-3 font-medium">상태</th>
                <th className="py-2 pr-3 font-medium">팔로업</th>
                <th className="py-2 pr-3 font-medium">견적</th>
                <th className="py-2 font-medium">액션</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const leadQuotes = quotes.filter((q) => q.lead_id === lead.id);
                const latest = leadQuotes[0];
                const due =
                  lead.next_followup &&
                  lead.next_followup <= today() &&
                  !["won", "lost"].includes(lead.status);
                return (
                  <tr key={lead.id} className="border-b border-border">
                    <td className="py-2 pr-3 align-middle">
                      <p className="font-medium text-ink" title={lead.memo ?? undefined}>
                        {lead.company_name}
                      </p>
                      <p className="text-xs text-muted">
                        {[lead.contact_name, lead.phone, lead.email].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td className="py-2 pr-3 align-middle">
                      <span
                        className={[
                          "whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium",
                          lead.deal_channel === "partner"
                            ? "bg-blue-50 text-blue-700"
                            : lead.deal_channel === "referral"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-subtle text-muted",
                        ].join(" ")}
                      >
                        {dealGroupLabel(lead.deal_channel, lead.partner_name)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 align-middle text-muted">
                      {[lead.industry, lead.region].filter(Boolean).join(" · ") || "-"}
                    </td>
                    <td className="py-2 pr-3 align-middle text-muted">{lead.source ?? "-"}</td>
                    <td className="py-2 pr-3 align-middle">
                      <select
                        value={lead.status}
                        onChange={(e) => updateLead(lead.id, { status: e.target.value as LeadStatus })}
                        className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent-deep"
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3 align-middle">
                      <input
                        type="date"
                        value={lead.next_followup ?? ""}
                        onChange={(e) =>
                          updateLead(lead.id, { next_followup: e.target.value || null })
                        }
                        className={[
                          "rounded-md border bg-surface px-2 py-1 text-xs outline-none focus:border-accent-deep",
                          due ? "border-red-300 text-red-600" : "border-border",
                        ].join(" ")}
                      />
                    </td>
                    <td className="py-2 pr-3 align-middle text-xs">
                      {leadQuotes.length > 0 ? (
                        <span className="text-muted">
                          {leadQuotes.length}건{latest ? ` · ${won(Number(latest.total_amount))}` : ""}
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="py-2 align-middle">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/quotes?leadId=${lead.id}`}
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-subtle"
                        >
                          견적 작성
                        </Link>
                        {lead.client_id ? (
                          <span className="rounded bg-tint px-2 py-1 text-xs text-accent-deep">
                            전환됨
                          </span>
                        ) : (
                          lead.status === "won" && (
                            <button
                              onClick={() => convert(lead)}
                              disabled={busy === lead.id}
                              className="rounded border border-accent-deep px-2 py-1 text-xs font-medium text-accent-deep hover:bg-tint disabled:opacity-50"
                            >
                              {busy === lead.id ? "전환 중…" : "고객사로 전환"}
                            </button>
                          )
                        )}
                        <button
                          onClick={() => removeLead(lead)}
                          className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-red-500"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
