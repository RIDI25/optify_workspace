"use client";

import { useState } from "react";
import type { Quote } from "@/types/database";
import { QuoteForm } from "@/components/quotes/quote-form";
import { QuoteList } from "@/components/quotes/quote-list";

export function QuotesView({
  leadId = null,
  diagnosisId = null,
}: {
  leadId?: string | null;
  diagnosisId?: string | null;
}) {
  const [seed, setSeed] = useState<Quote | null>(null);
  const [seedNonce, setSeedNonce] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">견적서</h1>
        <p className="mt-1 text-sm text-muted">
          계약 전 고객 대상 견적서 작성 · PDF/docx 출력 (owner 전용)
        </p>
      </div>

      <QuoteForm
        seed={seed}
        seedNonce={seedNonce}
        leadId={leadId}
        diagnosisId={diagnosisId}
        onExported={() => setRefreshKey((k) => k + 1)}
      />

      <QuoteList
        refreshKey={refreshKey}
        onCopy={(q) => {
          setSeed(q);
          setSeedNonce((n) => n + 1);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </div>
  );
}
