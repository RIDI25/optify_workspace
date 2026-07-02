"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { CHANNELS, channelLabel } from "@/lib/channels";
import { stripMarkdown } from "@/lib/text";
import type { Content, Profile } from "@/types/database";

export function LibraryView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [contents, setContents] = useState<Content[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Content | null>(null);
  const [copied, setCopied] = useState(false);

  const [fChannel, setFChannel] = useState("");
  const [fAuthor, setFAuthor] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .then(({ data }) => setProfiles((data ?? []) as Profile[]));
  }, []);

  useEffect(() => {
    if (!selectedClientId) return;
    const supabase = createClient();
    supabase
      .from("contents")
      .select("*")
      .eq("client_id", selectedClientId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setContents((data ?? []) as Content[]));
  }, [selectedClientId]);

  const profileName = (id: string | null) =>
    profiles.find((p) => p.id === id)?.name ?? "-";

  const filtered = useMemo(
    () =>
      contents.filter((c) => {
        if (fChannel && c.channel !== fChannel) return false;
        if (fAuthor && c.created_by !== fAuthor) return false;
        const day = c.created_at.slice(0, 10);
        if (fFrom && day < fFrom) return false;
        if (fTo && day > fTo) return false;
        return true;
      }),
    [contents, fChannel, fAuthor, fFrom, fTo],
  );

  async function copy(plain: boolean) {
    if (!selected) return;
    await navigator.clipboard.writeText(
      plain ? stripMarkdown(selected.body) : selected.body,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!selectedClientId) {
    return <p className="text-sm text-muted">상단에서 클라이언트를 선택하세요.</p>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">라이브러리</h1>
        <p className="mt-1 text-sm text-muted">
          {selectedClient?.name} · 생성 콘텐츠 {contents.length}건
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={fChannel}
          onChange={(e) => setFChannel(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
        >
          <option value="">채널 (전체)</option>
          {CHANNELS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={fAuthor}
          onChange={(e) => setFAuthor(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
        >
          <option value="">작성자 (전체)</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fFrom}
          onChange={(e) => setFFrom(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
        />
        <input
          type="date"
          value={fTo}
          onChange={(e) => setFTo(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="overflow-hidden rounded-lg border border-border lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">제목</th>
                <th className="px-3 py-2">채널</th>
                <th className="px-3 py-2">작성자</th>
                <th className="px-3 py-2">생성일</th>
                <th className="px-3 py-2">WP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => {
                    setSelected(c);
                    setCopied(false);
                  }}
                  className="cursor-pointer border-t border-border hover:bg-subtle"
                >
                  <td className="px-3 py-2 font-medium text-ink">
                    {c.title || "(제목 없음)"}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {channelLabel(c.channel)}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {profileName(c.created_by)}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">
                    {c.created_at.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2">
                    {c.wp_post_id ? (
                      <span className="rounded bg-tint px-1.5 py-0.5 text-xs text-accent-deep">
                        발행 #{c.wp_post_id}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted">
                    콘텐츠가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          {selected ? (
            <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-bold text-ink">
                  {selected.title || "(제목 없음)"}
                </h2>
                <button
                  onClick={() => setSelected(null)}
                  className="text-xs text-muted hover:text-ink"
                >
                  닫기
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copy(false)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-subtle"
                >
                  {copied ? "복사됨" : "복사"}
                </button>
                <button
                  onClick={() => copy(true)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-subtle"
                >
                  플레인 복사
                </button>
              </div>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-subtle p-3 font-sans text-sm leading-relaxed text-ink">
                {selected.body}
              </pre>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
              항목을 선택하면 본문이 표시됩니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
