import * as XLSX from "xlsx";
import { CHANNELS } from "@/lib/channels";

/**
 * 콘텐츠 플랜 엑셀 업로드 — 클라이언트에서 파일을 읽어 행을 파싱한다.
 * 첫 시트의 헤더 행을 자동 인식하고(동의어 매핑), 날짜·채널 값을 정규화한다.
 * 파싱 결과는 미리보기 테이블에 보여준 뒤 서버 액션(importPlans)으로 저장한다.
 */

export interface ParsedPlanRow {
  /** 원본 엑셀 행 번호 (1-base, 헤더 포함) */
  rowNo: number;
  title: string;
  keyword: string | null;
  /** YYYY-MM-DD 또는 null */
  date: string | null;
  /** 채널 키 (naver_blog 등) 또는 null(기본 채널 사용) */
  channel: string | null;
  memo: string | null;
  /** 비어 있으면 등록 가능, 있으면 해당 행 제외 */
  error: string | null;
  /** 등록은 되지만 확인이 필요한 사항 (날짜 인식 실패 등) */
  warnings: string[];
}

export interface ParseResult {
  rows: ParsedPlanRow[];
  /** 인식된 컬럼 → 엑셀 헤더명 */
  mapping: Record<string, string>;
  error?: string;
}

export const IMPORT_MAX_ROWS = 200;

/** 컬럼 동의어 — 헤더 셀 텍스트를 정규화해 비교 */
const COLUMN_SYNONYMS: Record<string, string[]> = {
  title: ["제목", "주제", "콘텐츠제목", "글제목", "소재", "콘텐츠주제", "title", "topic", "subject"],
  date: ["날짜", "발행일", "예정일", "발행예정일", "발행날짜", "일자", "게시일", "date", "일정"],
  keyword: ["키워드", "메인키워드", "핵심키워드", "타겟키워드", "keyword", "keywords"],
  channel: ["채널", "매체", "플랫폼", "channel"],
  memo: ["메모", "비고", "노트", "참고", "memo", "note", "notes"],
};

const normHeader = (s: string) => s.replace(/[\s_()\-·]/g, "").toLowerCase();

/** 채널 라벨/키/흔한 표기를 채널 키로 매핑. 인식 실패 시 null */
export function resolveChannel(raw: string): string | null {
  const v = raw.replace(/\s+/g, "").toLowerCase();
  if (!v) return null;
  for (const c of CHANNELS) {
    if (v === c.key || v === c.label.replace(/\s+/g, "").toLowerCase()) return c.key;
  }
  if (v.includes("네이버") || v.includes("naver") || v.includes("블로그")) return "naver_blog";
  if (v.includes("워드프레스") || v.includes("워프") || v.includes("wordpress") || v.includes("wp"))
    return "wordpress";
  if (v.includes("스레드") || v.includes("thread")) return "threads";
  return null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * 날짜 셀 정규화 → YYYY-MM-DD.
 * Date 객체(cellDates), 엑셀 시리얼 숫자, "2026-08-20"·"2026.8.20"·"8/20"·"8월 20일" 문자열 지원.
 * 연도 없는 표기는 올해로 간주.
 */
export function resolveDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return fmtDate(raw);
  if (typeof raw === "number" && isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed?.y) return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
    return null;
  }
  const s = String(raw).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})[일.]?$/);
  if (m) return `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`;
  m = s.match(/^(\d{1,2})[.\-/월]\s*(\d{1,2})[일.]?$/);
  if (m) return `${new Date().getFullYear()}-${pad2(Number(m[1]))}-${pad2(Number(m[2]))}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return fmtDate(d);
  return null;
}

const cellText = (v: unknown): string =>
  v == null ? "" : v instanceof Date ? fmtDate(v) : String(v).trim();

/** 워크북 ArrayBuffer → 파싱된 플랜 행 목록 */
export function parsePlanWorkbook(buffer: ArrayBuffer): ParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    return { rows: [], mapping: {}, error: "파일을 읽을 수 없습니다. 엑셀(.xlsx/.xls) 또는 CSV 파일인지 확인하세요." };
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], mapping: {}, error: "시트가 비어 있습니다." };

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  if (!grid.length) return { rows: [], mapping: {}, error: "데이터가 없습니다." };

  // 헤더 행 탐색: 상위 5행 중 동의어 매칭 컬럼이 가장 많은 행
  let headerIdx = -1;
  let best = 0;
  let cols: Record<string, number> = {};
  for (let i = 0; i < Math.min(5, grid.length); i++) {
    const found: Record<string, number> = {};
    (grid[i] ?? []).forEach((cell, ci) => {
      const h = normHeader(cellText(cell));
      if (!h) return;
      for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
        if (found[field] == null && synonyms.some((syn) => h === normHeader(syn))) {
          found[field] = ci;
        }
      }
    });
    const n = Object.keys(found).length;
    if (n > best) {
      best = n;
      headerIdx = i;
      cols = found;
    }
  }
  if (headerIdx < 0 || cols.title == null) {
    return {
      rows: [],
      mapping: {},
      error:
        "제목(주제) 컬럼을 찾지 못했습니다. 첫 행에 '제목' 또는 '주제' 헤더가 있는지 확인하세요. (인식 헤더: 제목/주제, 날짜/발행일, 키워드, 채널, 메모)",
    };
  }

  const mapping: Record<string, string> = {};
  for (const [field, ci] of Object.entries(cols)) {
    mapping[field] = cellText((grid[headerIdx] ?? [])[ci]);
  }

  const rows: ParsedPlanRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const title = cellText(r[cols.title]);
    const keywordRaw = cols.keyword != null ? cellText(r[cols.keyword]) : "";
    const dateRaw = cols.date != null ? r[cols.date] : null;
    const channelRaw = cols.channel != null ? cellText(r[cols.channel]) : "";
    const memoRaw = cols.memo != null ? cellText(r[cols.memo]) : "";
    // 전부 빈 행은 건너뜀
    if (!title && !keywordRaw && !cellText(dateRaw) && !channelRaw) continue;

    const warnings: string[] = [];
    let error: string | null = null;
    if (!title) error = "제목 없음";

    const date = resolveDate(dateRaw);
    if (!date && cellText(dateRaw)) warnings.push(`날짜 인식 실패: "${cellText(dateRaw)}"`);

    const channel = channelRaw ? resolveChannel(channelRaw) : null;
    if (channelRaw && !channel) warnings.push(`채널 인식 실패: "${channelRaw}" → 기본 채널로 등록`);

    rows.push({
      rowNo: i + 1,
      title,
      keyword: keywordRaw ? keywordRaw.split(/[,/]/)[0].trim() : null,
      date,
      channel,
      memo: memoRaw || null,
      error,
      warnings,
    });
  }

  if (!rows.length) return { rows: [], mapping, error: "등록할 데이터 행이 없습니다." };
  if (rows.length > IMPORT_MAX_ROWS) {
    return {
      rows: [],
      mapping,
      error: `한 번에 최대 ${IMPORT_MAX_ROWS}행까지 업로드할 수 있습니다 (현재 ${rows.length}행).`,
    };
  }
  return { rows, mapping };
}
