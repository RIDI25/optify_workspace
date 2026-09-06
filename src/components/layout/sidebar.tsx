"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  COLLAPSIBLE_SECTIONS,
  DEFAULT_QUERY,
  NAV_BLOCKS,
  NAV_ITEMS,
  type NavBlockKey,
  type NavItem,
  type NavRelevance,
} from "@/lib/nav";
import { getService } from "@/lib/services";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import type { Role } from "@/types/database";

type ServiceLite = { service_type: string; status: string };

// ── 선택한 고객사의 계약 서비스 (표시용) ─────────────────────────
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

/** 계약으로 본 메뉴 관련성. 등록된 서비스가 없거나 아직 모르면 전부 관련 있음. */
function relevanceOf(rows: ServiceLite[] | null): Record<NavRelevance, boolean> {
  const known = (rows ?? []).map((r) => ({ def: getService(r.service_type), status: r.status })).filter((r) => r.def);
  if (known.length === 0) return { content: true, report: true };
  const active = known.filter((r) => r.status === "active").map((r) => r.def!);
  return {
    content: active.some((s) => s.channels.length > 0),
    report: active.some((s) => s.billing === "period"),
  };
}

// ── 접기/펼치기 상태 (브라우저에 기억) ───────────────────────────
const OPEN_EVENT = "optify:nav-open";
function subscribeOpen(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(OPEN_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(OPEN_EVENT, cb);
  };
}
function useStoredOpen(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    subscribeOpen,
    () => {
      try {
        const s = window.localStorage.getItem(key);
        return s === null ? initial : s === "1";
      } catch {
        return initial;
      }
    },
    () => initial,
  );
  const set = (v: boolean) => {
    try {
      window.localStorage.setItem(key, v ? "1" : "0");
    } catch {
      // 저장 못 해도 동작에는 지장 없음
    }
    window.dispatchEvent(new Event(OPEN_EVENT));
  };
  return [value, set];
}

// ── 활성 판단: 경로 + 쿼리(view) ────────────────────────────────
function parseHref(href: string): { path: string; params: URLSearchParams } {
  const [path, q] = href.split("?");
  return { path, params: new URLSearchParams(q ?? "") };
}
function useIsActive() {
  const pathname = usePathname();
  const search = useSearchParams();
  return (href: string) => {
    const { path, params } = parseHref(href);
    const pathOk = path === "/" ? pathname === "/" : pathname.startsWith(path);
    if (!pathOk) return false;
    for (const [k, v] of params) {
      if ((search.get(k) ?? DEFAULT_QUERY[k]) !== v) return false;
    }
    return true;
  };
}

// ── 조각 ────────────────────────────────────────────────────────
function NavLink({
  item,
  active,
  dim,
  block,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  dim: boolean;
  block: NavBlockKey;
  onNavigate?: () => void;
}) {
  const activeCls = block === "client" ? "bg-surface text-accent-deep shadow-sm ring-1 ring-accent/30" : "bg-tint text-accent-deep";
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={dim ? "이 고객사 계약에는 없는 업무입니다 (열 수는 있어요)" : undefined}
      className={[
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
        active ? activeCls : "text-ink hover:bg-surface/80",
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
      {item.icon && (
        <span className="w-4 shrink-0 text-center text-[13px]" aria-hidden>
          {item.icon}
        </span>
      )}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Caption({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" }) {
  return (
    <p className={["px-2.5 pb-0.5 pt-2.5 text-[11px] font-semibold tracking-wide", tone === "accent" ? "text-accent-deep" : "text-muted"].join(" ")}>
      {children}
    </p>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className={["transition-transform", open ? "rotate-90" : ""].join(" ")}
    >
      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 고객사 선택 + 진행중 계약 칩. 고객사 업무 블록의 머리 */
function ClientPicker({ services }: { services: ServiceLite[] | null }) {
  const { clients, selectedClientId, setSelectedClientId, loading } = useClientContext();
  if (loading) return <p className="px-2.5 py-1 text-xs text-muted">고객사 불러오는 중…</p>;
  if (clients.length === 0) {
    return (
      <p className="px-2.5 py-1 text-xs text-muted">
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
    <div className="px-2 pb-1 pt-1">
      <select
        value={selectedClientId ?? ""}
        onChange={(e) => setSelectedClientId(e.target.value)}
        aria-label="고객사 선택"
        className="w-full rounded-md border border-accent/40 bg-surface px-2 py-1.5 text-sm font-semibold text-accent-deep outline-none focus:border-accent"
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.is_internal ? " (내부)" : ""}
          </option>
        ))}
      </select>
      <div className="mt-1.5 flex flex-wrap gap-1 px-0.5">
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

// ── 메뉴 본체 ───────────────────────────────────────────────────
function NavListInner({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const isActive = useIsActive();
  const { selectedClientId } = useClientContext();
  const services = useClientServices(selectedClientId);
  const relevance = relevanceOf(services);
  const [contentOpenStored, setContentOpen] = useStoredOpen("optify.nav.contentOpen", true);

  const visible = NAV_ITEMS.filter((item) => !item.ownerOnly || role === "owner");

  return (
    <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
      {NAV_BLOCKS.map((b) => {
        const items = visible.filter((i) => i.block === b.key);
        const isClient = b.key === "client";
        return (
          <div
            key={b.key}
            className={[
              "rounded-xl border p-1.5",
              isClient ? "border-accent/30 bg-tint/70" : "border-border bg-subtle/70",
            ].join(" ")}
          >
            <p
              className={[
                "flex items-center gap-1.5 px-2 pb-1 pt-1 text-[11px] font-bold tracking-wide",
                isClient ? "text-accent-deep" : "text-ink",
              ].join(" ")}
            >
              <span aria-hidden>{b.icon}</span>
              {b.label}
            </p>
            {isClient && <ClientPicker services={services} />}

            {items.map((item, i) => {
              const showSection = item.section && items[i - 1]?.section !== item.section;
              const collapsible = item.section ? COLLAPSIBLE_SECTIONS.includes(item.section) : false;
              const sectionActive = collapsible && items.some((x) => x.section === item.section && isActive(x.href));
              const open = !collapsible || contentOpenStored || sectionActive;
              const dim = item.relevance ? !relevance[item.relevance] : false;
              return (
                <div key={item.href}>
                  {showSection &&
                    (collapsible ? (
                      <button
                        type="button"
                        onClick={() => setContentOpen(!open)}
                        aria-expanded={open}
                        className="mt-1.5 flex w-full items-center justify-between rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wide text-accent-deep hover:bg-surface/80"
                      >
                        <span>{item.section}</span>
                        <Chevron open={open} />
                      </button>
                    ) : (
                      <Caption tone={isClient ? "accent" : "muted"}>{item.section}</Caption>
                    ))}
                  {open && <NavLink item={item} active={isActive(item.href)} dim={dim} block={b.key} onNavigate={onNavigate} />}
                </div>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

/** 데스크톱 사이드바·모바일 드로어 공용 메뉴 목록 */
export function NavList(props: { role: Role; onNavigate?: () => void }) {
  return (
    <Suspense fallback={null}>
      <NavListInner {...props} />
    </Suspense>
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
