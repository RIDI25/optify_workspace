"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { daysUntilEnd, getService, serviceLabel } from "@/lib/services";
import type { ClientService } from "@/types/database";

/**
 * 콘텐츠 화면 상단 계약 배너 — 선택된 고객사의 진행중 계약을 표시.
 * 계약이 없는 외부 고객사면 등록 안내. 내부(옵티파이)는 표시 안 함.
 */
export function ServiceBanner() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [services, setServices] = useState<ClientService[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!selectedClientId) return;
    setLoaded(false);
    createClient()
      .from("client_services")
      .select("*")
      .eq("client_id", selectedClientId)
      .in("status", ["active", "paused"])
      .then(({ data }) => {
        setServices((data ?? []) as ClientService[]);
        setLoaded(true);
      });
  }, [selectedClientId]);

  if (!selectedClient || selectedClient.is_internal || !loaded) return null;

  if (services.length === 0) {
    return (
      <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-ink">
        ⚠️ <b>{selectedClient.name}</b>에 등록된 계약 서비스가 없습니다. 어떤 업무를
        진행하는 고객사인지{" "}
        <Link href="/settings" className="font-medium text-accent-deep underline">
          설정 → 고객사
        </Link>
        에서 계약을 등록하세요.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">계약</span>
      {services.map((svc) => {
        const d = getService(svc.service_type);
        const days = svc.billing === "period" ? daysUntilEnd(svc.end_date) : null;
        const expiring = days != null && days <= 30;
        return (
          <span
            key={svc.id}
            className={[
              "rounded-md px-2 py-0.5 text-xs font-medium",
              svc.status === "paused"
                ? "bg-subtle text-muted line-through"
                : expiring
                  ? "bg-amber-50 text-amber-700"
                  : "bg-tint text-accent-deep",
            ].join(" ")}
            title={svc.billing === "period" ? `${svc.start_date} ~ ${svc.end_date}` : undefined}
          >
            {d?.emoji} {serviceLabel(svc.service_type)}
            {days != null && svc.status === "active" && (
              <b className="ml-1">{days >= 0 ? `D-${days}` : "만료"}</b>
            )}
          </span>
        );
      })}
    </div>
  );
}
