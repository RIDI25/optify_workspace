"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Client } from "@/types/database";

interface ClientContextValue {
  clients: Client[];
  selectedClientId: string | null;
  selectedClient: Client | null;
  setSelectedClientId: (id: string) => void;
  loading: boolean;
}

const ClientContext = createContext<ClientContextValue | null>(null);

const STORAGE_KEY = "optify.selectedClientId";

export function ClientProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase
      .from("clients")
      .select("*")
      .order("is_internal", { ascending: false })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []) as Client[];
        setClients(rows);
        const stored =
          typeof window !== "undefined"
            ? window.localStorage.getItem(STORAGE_KEY)
            : null;
        const initial =
          rows.find((c) => c.id === stored)?.id ?? rows[0]?.id ?? null;
        setSelected(initial);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const setSelectedClientId = (id: string) => {
    setSelected(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  };

  const value = useMemo<ClientContextValue>(
    () => ({
      clients,
      selectedClientId,
      selectedClient: clients.find((c) => c.id === selectedClientId) ?? null,
      setSelectedClientId,
      loading,
    }),
    [clients, selectedClientId, loading],
  );

  return (
    <ClientContext.Provider value={value}>{children}</ClientContext.Provider>
  );
}

export function useClientContext() {
  const ctx = useContext(ClientContext);
  if (!ctx) {
    throw new Error("useClientContext must be used within ClientProvider");
  }
  return ctx;
}
