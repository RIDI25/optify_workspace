"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, NAV_ITEMS, type NavItem, type NavRelevance } from "@/lib/nav";
import { getService } from "@/lib/services";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import type { Role } from "@/types/database";

type ServiceLite = { service_type: string; status: string };

/** 선택한 고객사의 계약 서비스 (표시용). null = 아직 불러오는 중 */
function useClientServices(clientId: string | null): ServiceLite[] | null {
  const [state, setState] = useState<{ clientId: string | null; rows: ServiceLite[] }>({
    clientId: null,
    rows: [],
  });
  useEffect(() => {
    if (!clientId) return;
    let active = true;
    createClient()
      .from("client_services")
      .select("service_type, status")
      .eq("client_id", clientId)
      .then(({ data }) => {
        if (active) setState({ clientId, rows: (data ?? []) as ServiceLite[] });
      });
    return () => {
      active = false;
    };
  }, [clientId]);
  return state.clientId === clientId ? state.rows : null;
}

/**
 * 계약으로 본 메뉴 관련성. 등록된 서비스가 없거나 아직 모르면 전부 관련 있음.
 * content = 콘텐츠 채널이 있는 진행중 계약(GEO 콘텐츠·플레이스/블로그 관리), report = 진행중 기간제 계약.
 */
function relevanceOf(rows: ServiceLite[] | null): Record<NavRelevance, boolean> {
  const known = (rows ?? []).map((r) => ({ def: getService(r.service_type), status: r.status })).filter((r) => r.def);
  if (known.length === 0) return { content: true, report: true };
  const active = known.filter((r) => r.status === "active").map((r) => r.def!);
  return {
    content: active.some((s) => s.channels.length > 0),
    report: active.some((s) => s.billing === "period"),
  };
}

function NavLink({
  item,
  active,
  dim,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  dim: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={dim ? "이 고객사 계약에는 없는 업무입니다 (열 수는 있어요)" : undefined}
      className={[
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-tint text-accent-deep" : "text-ink hover:bg-subtle",
        dim && !active ? "opacity-45" : "",
      ].join(" ")}
    >
      {item.step != null && (
        <span
          className={[
            "inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded font-mono text-[10px]",
            active ? "bg-accent-deep text-white" : "bg-subtle text-muted",
          ].join(" ")}
        >
          {item.step}
        </span>
      )}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</p>
  );
}

/** 고객사 선택 + 계약 서비스 칩. 고객사 업무 묶음의 머리 */
function ClientPicker({ services }: { services: ServiceLite[] | null }) {
  const { clients, selectedClientId, setSelectedClientId, loading } = useClientContext();
  if (loading) return <p className="px-3 py-1 text-xs text-muted">고객사 불러오는 중…</p>;
  if (clients.length === 0) {
    return (
      <p className="px-3 py-1 text-xs text-muted">
        고객사가 없습니다.{" "}
        <Link href="/settings" className="text-accent-deep hover:underline">
          설정에서 등록
        </Link>
      </p>
    );
  }
  const activeServices = (services ?? [])
    .filter((s) => s.status === "active")
    .map((s) => getService(s.service_type))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  return (
    <div className="px-3 pb-1">
      <select
        value={selectedClientId ?? ""}
        onChange={(e) => setSelectedClientId(e.target.value)}
        aria-label="고객사 선택"
        className="w-full rounded-md border border-accent/40 bg-tint px-2 py-1.5 text-sm font-semibold text-accent-deep outline-none focus:border-accent"
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.is_internal ? " (내부)" : ""}
          </option>
        ))}
      </select>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {services === null ? null : activeServices.length === 0 ? (
          <Link href="/settings" className="text-[11px] text-muted hover:text-accent-deep hover:underline">
            진행중 계약 없음 · 설정에서 등록
          </Link>
        ) : (
          activeServices.map((s) => (
            <span
              key={s.key}
              title={s.description}
              className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-accent-deep ring-1 ring-accent/30"
            >
              {s.emoji} {s.label}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

/** 데스크톱 사이드바·모바일 드로어 공용 메뉴 목록 */
export function NavList({
  role,
  onNavigate,
}: {
  role: Role;
  /** 모바일 드로어에서 링크 클릭 시 닫기용 */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { selectedClientId } = useClientContext();
  const services = useClientServices(selectedClientId);
  const relevance = relevanceOf(services);

  const visible = NAV_ITEMS.filter((item) => !item.ownerOnly || role === "owner");
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const top = visible.filter((i) => !i.group);

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
      {top.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(item.href)} dim={false} onNavigate={onNavigate} />
      ))}

      {NAV_GROUPS.map((g) => {
        const items = visible.filter((i) => i.group === g.key);
        if (items.length === 0) return null;
        return (
          <div key={g.key}>
            <Caption>{g.label}</Caption>
            {g.key === "client" && <ClientPicker services={services} />}
            {items.map((item, i) => {
              const showSection = item.section && items[i - 1]?.section !== item.section;
              const dim = item.relevance ? !relevance[item.relevance] : false;
              return (
                <div key={item.href}>
                  {showSection && (
                    <p className="px-3 pb-0.5 pt-2 text-[11px] text-muted">{item.section}</p>
                  )}
                  <NavLink item={item} active={isActive(item.href)} dim={dim} onNavigate={onNavigate} />
                </div>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <span className="inline-block h-3 w-3 rounded-full bg-accent" aria-hidden />
        <span className="text-base font-bold tracking-tight text-ink">옵티파이 워크스페이스</span>
      </div>

      <NavList role={role} />

      <div className="border-t border-border px-5 py-3 text-xs text-muted">
        {role === "owner" ? "관리자(owner)" : "멤버(member)"}
      </div>
    </aside>
  );
}
