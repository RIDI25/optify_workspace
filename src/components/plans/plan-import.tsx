"use client";

import { useRef, useState } from "react";
import { useClientContext } from "@/components/providers/client-context";
import { channelLabel } from "@/lib/channels";
import { importPlans } from "@/lib/actions/plans";
import {
  parsePlanWorkbook,
  type ParsedPlanRow,
} from "@/lib/plan-import";
import type { ChannelSettings } from "@/types/database";

const input =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent-deep";

/**
 * 엑셀 업로드 → 파싱 미리보기 → 콘텐츠 플랜 일괄 등록 패널.
 * 채널 컬럼이 없거나 인식 실패한 행은 아래에서 선택한 기본 채널로 등록된다.
 */
export function PlanImport({
  channels,
  onCreated,
}: {
  channels: ChannelSettings[];
  onCreated: () => void;
}) {
  const { selectedClientId } = useClientContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedPlanRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultChannel, setDefaultChannel] = useState(
    channels[0]?.channel ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const valid = rows.filter((r) => !r.error);
  const invalid = rows.filter((r) => r.error);

  async function onFile(file: File) {
    setMsg("");
    setRows([]);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const result = parsePlanWorkbook(buffer);
      if (result.error) {
        setMsg(result.error);
        return;
      }
      setRows(result.rows);
      setMapping(result.mapping);
    } catch {
      setMsg("파일을 읽는 중 오류가 발생했습니다.");
    }
  }

  async function register() {
    if (!selectedClientId || !valid.length || busy) return;
    if (!defaultChannel && valid.some((r) => !r.channel)) {
      setMsg("기본 채널을 선택하세요.");
      return;
    }
    setBusy(true);
    setMsg("등록 중…");
    try {
      const r = await importPlans({
        clientId: selectedClientId,
        items: valid.map((row) => ({
          title: row.title,
          channel: row.channel ?? defaultChannel,
          keyword: row.keyword,
          date: row.date,
          memo: row.memo,
        })),
      });
      if (r.ok) {
        setMsg(
          `${r.count}건 등록 완료 — 캘린더·리스트에 반영됐습니다.` +
            (invalid.length ? ` (오류 ${invalid.length}행 제외)` : ""),
        );
        setRows([]);
        setFileName("");
        if (fileRef.current) fileRef.current.value = "";
        onCreated();
      } else {
        setMsg(`실패: ${r.error}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted">
            엑셀 파일 (.xlsx / .xls / .csv)
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
            className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-tint file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-deep hover:file:opacity-90"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted">
            기본 채널 (채널 컬럼이 없는 행에 적용)
          </span>
          <select
            value={defaultChannel}
            onChange={(e) => setDefaultChannel(e.target.value)}
            className={input}
          >
            {channels.map((c) => (
              <option key={c.channel} value={c.channel}>
                {channelLabel(c.channel)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-[11px] text-muted">
        첫 행이 헤더인 엑셀을 올리면 자동으로 읽습니다. 인식 컬럼: <b>제목/주제</b>(필수),
        날짜/발행일, 키워드, 채널, 메모. 키워드는 보관함에 자동 연결(없으면 생성)됩니다.
      </p>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-tint px-2 py-0.5 font-medium text-accent-deep">
              {fileName}
            </span>
            <span className="text-muted">
              인식된 컬럼:{" "}
              {Object.entries(mapping)
                .map(
                  ([field, header]) =>
                    `${
                      { title: "제목", date: "날짜", keyword: "키워드", channel: "채널", memo: "메모" }[
                        field
                      ] ?? field
                    }←"${header}"`,
                )
                .join(", ")}
            </span>
          </div>

          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-subtle text-left text-xs text-muted">
                <tr>
                  <th className="px-2 py-1.5">행</th>
                  <th className="px-2 py-1.5">제목</th>
                  <th className="px-2 py-1.5">날짜</th>
                  <th className="px-2 py-1.5">키워드</th>
                  <th className="px-2 py-1.5">채널</th>
                  <th className="px-2 py-1.5">비고</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.rowNo}
                    className={[
                      "border-t border-border",
                      r.error ? "bg-red-50 text-red-600" : "",
                    ].join(" ")}
                  >
                    <td className="px-2 py-1.5 font-mono text-xs text-muted">
                      {r.rowNo}
                    </td>
                    <td className="max-w-[240px] truncate px-2 py-1.5 font-medium text-ink">
                      {r.title || "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs">
                      {r.date ?? "-"}
                    </td>
                    <td className="max-w-[140px] truncate px-2 py-1.5">
                      {r.keyword ?? "-"}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.channel
                        ? channelLabel(r.channel)
                        : defaultChannel
                          ? `${channelLabel(defaultChannel)} (기본)`
                          : "-"}
                    </td>
                    <td className="px-2 py-1.5 text-xs">
                      {r.error ? (
                        <span className="font-medium">제외: {r.error}</span>
                      ) : r.warnings.length ? (
                        <span className="text-amber-600">
                          {r.warnings.join(" · ")}
                        </span>
                      ) : (
                        <span className="text-muted">✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={register}
              disabled={busy || !valid.length}
              className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "등록 중…" : `플랜 ${valid.length}건 등록`}
            </button>
            {invalid.length > 0 && (
              <span className="text-xs text-red-600">
                오류 {invalid.length}행은 제외됩니다.
              </span>
            )}
          </div>
        </>
      )}

      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
