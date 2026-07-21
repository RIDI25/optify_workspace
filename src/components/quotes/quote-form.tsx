"use client";

import { useEffect, useRef, useState } from "react";
import {
  CATALOG_BASE_PRICES,
  CATALOG_ITEM_INDEX,
  QUOTE_CATALOG,
  QUOTE_UNITS,
  formatManwon,
  type QuoteCatalogItem,
} from "@/lib/quote-items";
import { QUOTE_VALID_DAYS } from "@/lib/quote-config";
import {
  calcQuoteTotals,
  won,
  type QuoteLineItem,
  type VatMode,
} from "@/lib/export/quote-model";
import { createClient } from "@/lib/supabase/client";
import type { Lead, Quote } from "@/types/database";

interface DraftItem {
  key: number;
  category: string | null; // 카탈로그 카테고리, 수기 추가는 null
  name: string;
  detail: string;
  qty: number;
  unit: string;
  unit_price: number;
  /** 카탈로그 기준단가 — 표시·되돌리기용 (스냅샷에는 저장 안 함) */
  base_price: number | null;
}

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const input =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent-deep";

export function QuoteForm({
  seed,
  seedNonce,
  leadId = null,
  diagnosisId = null,
  onExported,
}: {
  /** 내역 리스트 '복사' 시 폼에 채울 견적 (새 견적으로 시작) */
  seed: Quote | null;
  seedNonce: number;
  /** 리드에서 '견적 작성'으로 진입 시 — 고객 정보 프리필 + 견적에 연결 */
  leadId?: string | null;
  /** SEO 진단에서 '개선 견적 만들기'로 진입 시 — 개선 품목 프리필 */
  diagnosisId?: string | null;
  onExported: () => void;
}) {
  const keyRef = useRef(0);
  const nextKey = () => ++keyRef.current;

  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [quoteDate, setQuoteDate] = useState(localDate());
  const [validUntil, setValidUntil] = useState(localDate(QUOTE_VALID_DAYS));
  const [items, setItems] = useState<DraftItem[]>([]);
  const [vatMode, setVatMode] = useState<VatMode>("excluded");
  const [notes, setNotes] = useState("");
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);
  const [savedQuoteNo, setSavedQuoteNo] = useState<string | null>(null);
  const [linkedLeadId, setLinkedLeadId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");

  // SEO 진단에서 진입 (/quotes?diagnosisId=...) → 개선 품목·고객 정보 프리필
  useEffect(() => {
    if (!diagnosisId) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("seo_diagnoses")
        .select("*")
        .eq("id", diagnosisId)
        .single();
      if (!data) return;
      const results = data.results as {
        finalUrl?: string;
        pageTitle?: string | null;
        suggestedItems?: string[];
      };
      const drafts: DraftItem[] = (results.suggestedItems ?? [])
        .map((name) => CATALOG_ITEM_INDEX.get(name))
        .filter((e): e is NonNullable<typeof e> => !!e)
        .map((e) => ({
          key: nextKey(),
          category: e.category,
          name: e.item.name,
          detail: e.item.detail,
          qty: 1,
          unit: e.item.unit,
          unit_price: e.item.basePrice,
          base_price: e.item.basePrice,
        }));
      if (drafts.length) setItems(drafts);
      if (data.lead_id) {
        setLinkedLeadId(data.lead_id);
        const { data: lead } = await supabase
          .from("leads")
          .select("*")
          .eq("id", data.lead_id)
          .single();
        if (lead) {
          setCustomerName(lead.company_name);
          setCustomerContact(lead.contact_name ?? "");
          setCustomerPhone(lead.phone ?? "");
          setCustomerEmail(lead.email ?? "");
        }
      } else if (results.finalUrl) {
        const host = new URL(results.finalUrl).hostname.replace(/^www\./, "");
        setCustomerName(results.pageTitle?.split(/[|\-–]/)[0].trim() || host);
      }
      setMsg(`진단 결과에서 개선 품목 ${drafts.length}개를 불러왔습니다. 수량·단가를 확인하세요.`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosisId]);

  // 리드에서 진입 (/quotes?leadId=...) → 고객 정보 프리필 + 연결
  useEffect(() => {
    if (!leadId) return;
    const supabase = createClient();
    supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single()
      .then(({ data }) => {
        const lead = data as Lead | null;
        if (!lead) return;
        setLinkedLeadId(lead.id);
        setCustomerName(lead.company_name);
        setCustomerContact(lead.contact_name ?? "");
        setCustomerPhone(lead.phone ?? "");
        setCustomerEmail(lead.email ?? "");
        setMsg(`리드 '${lead.company_name}' 정보를 불러왔습니다. 출력 시 리드에 연결됩니다.`);
      });
  }, [leadId]);

  // '복사해서 새 견적' — 날짜는 오늘 기준으로 갱신, 견적번호는 새로 채번
  useEffect(() => {
    if (!seed) return;
    setCustomerName(seed.customer_name);
    setCustomerContact(seed.customer_contact ?? "");
    setCustomerPhone(seed.customer_phone ?? "");
    setCustomerEmail(seed.customer_email ?? "");
    setQuoteDate(localDate());
    setValidUntil(localDate(QUOTE_VALID_DAYS));
    setItems(
      seed.items.map((it) => ({
        ...it,
        key: nextKey(),
        base_price: CATALOG_BASE_PRICES.get(it.name) ?? null,
      })),
    );
    setVatMode(seed.vat_mode);
    setNotes(seed.notes ?? "");
    setSavedQuoteId(null);
    setSavedQuoteNo(null);
    setLinkedLeadId(seed.lead_id ?? null);
    setMsg(`${seed.quote_no} 내용을 복사했습니다. 출력 시 새 견적번호로 저장됩니다.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedNonce]);

  function addCatalogItem(category: string, item: QuoteCatalogItem) {
    setItems((prev) => [
      ...prev,
      {
        key: nextKey(),
        category,
        name: item.name,
        detail: item.detail,
        qty: 1,
        unit: item.unit,
        unit_price: item.basePrice, // 기준단가 자동 입력 (수동 수정 가능)
        base_price: item.basePrice,
      },
    ]);
  }

  function addCustomItem() {
    setItems((prev) => [
      ...prev,
      { key: nextKey(), category: null, name: "", detail: "", qty: 1, unit: "식", unit_price: 0, base_price: null },
    ]);
  }

  function updateItem(key: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: number) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  function reset() {
    setCustomerName("");
    setCustomerContact("");
    setCustomerPhone("");
    setCustomerEmail("");
    setQuoteDate(localDate());
    setValidUntil(localDate(QUOTE_VALID_DAYS));
    setItems([]);
    setVatMode("excluded");
    setNotes("");
    setSavedQuoteId(null);
    setSavedQuoteNo(null);
    setLinkedLeadId(null);
    setMsg("");
  }

  const lineItems: QuoteLineItem[] = items.map((it) => ({
    category: it.category,
    name: it.name,
    detail: it.detail,
    qty: it.qty,
    unit: it.unit,
    unit_price: it.unit_price,
    amount: Math.round(it.qty * it.unit_price),
  }));
  const totals = calcQuoteTotals(lineItems, vatMode);

  async function exportAs(format: "pdf" | "docx") {
    if (!customerName.trim()) {
      setMsg("고객사명을 입력하세요.");
      return;
    }
    const valid = lineItems.filter((it) => it.name.trim());
    if (!valid.length) {
      setMsg("품목을 1개 이상 추가하세요.");
      return;
    }
    setBusy(format);
    setMsg("");
    try {
      const res = await fetch("/api/quotes/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: savedQuoteId ?? undefined,
          quote: {
            customer_name: customerName,
            customer_contact: customerContact || null,
            customer_phone: customerPhone || null,
            customer_email: customerEmail || null,
            quote_date: quoteDate,
            valid_until: validUntil || null,
            items: valid,
            vat_mode: vatMode,
            notes: notes || null,
            lead_id: linkedLeadId,
          },
          format,
          exportedAt: new Date().toISOString(),
        }),
      });
      const d = await res.json();
      if (d.ok && d.url) {
        setSavedQuoteId(d.quoteId);
        setSavedQuoteNo(d.quoteNo);
        window.open(d.url, "_blank");
        setMsg(`${d.quoteNo} ${format.toUpperCase()} 생성 완료`);
        onExported();
      } else {
        setMsg(`실패: ${d.error ?? "알 수 없음"}`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "내보내기 실패");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="space-y-5 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">
          견적서 작성
          {savedQuoteNo && (
            <span className="ml-2 font-mono text-xs font-normal text-accent-deep">
              {savedQuoteNo} 저장됨
            </span>
          )}
        </h2>
        <button
          onClick={reset}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-subtle"
        >
          새 견적
        </button>
      </div>

      {/* 고객 · 견적 정보 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-ink">
            고객사명 <span className="text-accent-deep">*</span>
          </span>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="예: OO치과의원"
            className={`w-full ${input}`}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-ink">담당자</span>
          <input
            value={customerContact}
            onChange={(e) => setCustomerContact(e.target.value)}
            className={`w-full ${input}`}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-ink">연락처</span>
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className={`w-full ${input}`}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-ink">이메일</span>
          <input
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className={`w-full ${input}`}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-ink">견적일</span>
          <input
            type="date"
            value={quoteDate}
            onChange={(e) => setQuoteDate(e.target.value)}
            className={`w-full ${input}`}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-ink">유효기간</span>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className={`w-full ${input}`}
          />
        </label>
      </div>

      {/* 품목 카탈로그 */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">품목 선택 (클릭하면 추가)</p>
        <div className="grid gap-2 md:grid-cols-2">
          {QUOTE_CATALOG.map((cat) => (
            <div key={cat.category} className="rounded-md border border-border p-2.5">
              <p className="mb-1.5 text-xs font-bold text-accent-deep">{cat.category}</p>
              <div className="flex flex-wrap gap-1.5">
                {cat.items.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => addCatalogItem(cat.category, item)}
                    title={`${item.detail} · 기준 ${formatManwon(item.basePrice)}원`}
                    className="rounded border border-border px-2 py-1 text-xs text-ink hover:border-accent-deep hover:bg-tint"
                  >
                    + {item.name} <span className="text-muted">{formatManwon(item.basePrice)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 선택된 품목 테이블 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-ink">견적 품목 ({items.length})</p>
          <button
            onClick={addCustomItem}
            className="rounded-md border border-accent-deep px-3 py-1.5 text-sm font-medium text-accent-deep hover:bg-tint"
          >
            + 품목 직접 추가
          </button>
        </div>
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted">
            위 카탈로그에서 품목을 선택하거나 직접 추가하세요.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="w-24 py-2 pr-2 font-medium">구분</th>
                  <th className="py-2 pr-2 font-medium">품목</th>
                  <th className="py-2 pr-2 font-medium">내역</th>
                  <th className="w-16 py-2 pr-2 font-medium">수량</th>
                  <th className="w-20 py-2 pr-2 font-medium">단위</th>
                  <th className="w-36 py-2 pr-2 font-medium">단가 (원)</th>
                  <th className="w-28 py-2 pr-2 text-right font-medium">금액</th>
                  <th className="w-8 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.key} className="border-b border-border">
                    <td className="py-1.5 pr-2 align-middle">
                      <span className="whitespace-nowrap text-[10px] text-muted">
                        {it.category ?? "직접 입력"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 align-middle">
                      <input
                        value={it.name}
                        onChange={(e) => updateItem(it.key, { name: e.target.value })}
                        placeholder="품목명"
                        className={`w-full min-w-36 ${input}`}
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-middle">
                      <input
                        value={it.detail}
                        onChange={(e) => updateItem(it.key, { detail: e.target.value })}
                        placeholder="내역"
                        className={`w-full min-w-44 ${input}`}
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-middle">
                      <input
                        type="number"
                        min={1}
                        value={it.qty}
                        onChange={(e) => updateItem(it.key, { qty: Number(e.target.value) || 0 })}
                        className={`w-full ${input}`}
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-middle">
                      <select
                        value={it.unit}
                        onChange={(e) => updateItem(it.key, { unit: e.target.value })}
                        className={`w-full ${input}`}
                      >
                        {QUOTE_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2 align-middle">
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        value={it.unit_price}
                        onChange={(e) =>
                          updateItem(it.key, { unit_price: Number(e.target.value) || 0 })
                        }
                        className={`w-full text-right ${input}`}
                      />
                      {it.base_price != null && (
                        <button
                          onClick={() => updateItem(it.key, { unit_price: it.base_price! })}
                          title="기준단가로 되돌리기"
                          className={[
                            "mt-0.5 block w-full text-right text-[10px]",
                            it.unit_price === it.base_price
                              ? "text-muted/60"
                              : "text-muted hover:text-accent-deep",
                          ].join(" ")}
                        >
                          기준 {formatManwon(it.base_price)}
                        </button>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right align-middle font-mono text-ink">
                      {Math.round(it.qty * it.unit_price).toLocaleString("ko-KR")}
                    </td>
                    <td className="py-1.5 text-right align-middle">
                      <button
                        onClick={() => removeItem(it.key)}
                        className="text-muted hover:text-red-500"
                        aria-label="품목 삭제"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 부가세 · 합계 */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-md bg-subtle p-4">
        <div className="space-y-1.5 text-sm">
          <p className="font-medium text-ink">부가세</p>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={vatMode === "excluded"}
                onChange={() => setVatMode("excluded")}
                className="accent-[#057A4E]"
              />
              별도 (입력 단가에 10% 가산)
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={vatMode === "included"}
                onChange={() => setVatMode("included")}
                className="accent-[#057A4E]"
              />
              포함 (입력 단가에서 역산)
            </label>
          </div>
        </div>
        <div className="space-y-0.5 text-right text-sm">
          <p className="text-muted">공급가액 {won(totals.supply)}</p>
          <p className="text-muted">부가세 {won(totals.vat)}</p>
          <p className="text-base font-bold text-accent-deep">합계 {won(totals.total)}</p>
        </div>
      </div>

      {/* 비고 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-ink">특약사항 · 비고</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={"예: 잔금은 검수 완료 후 7일 이내 지급\n호스팅·도메인 비용은 실비 청구"}
          className={`w-full ${input}`}
        />
      </label>

      {/* 출력 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => exportAs("pdf")}
          disabled={!!busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
        >
          {busy === "pdf" ? "PDF 생성 중…" : "PDF 출력"}
        </button>
        <button
          onClick={() => exportAs("docx")}
          disabled={!!busy}
          className="rounded-md border border-accent-deep px-4 py-2 text-sm font-medium text-accent-deep hover:bg-tint disabled:opacity-50"
        >
          {busy === "docx" ? "docx 생성 중…" : "docx 출력"}
        </button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </section>
  );
}
