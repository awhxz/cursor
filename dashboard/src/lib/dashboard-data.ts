import { columnAliases } from "@/config/sheets";

export type RawRow = Record<string, string>;
// Dashboard rows include raw string cells plus computed boolean flags such as __dateValid.
export type DashboardRow = Record<string, string | boolean> & {
  __id: string;
  __analyst: string;
  __ticket: string;
  __title: string;
  __status: string;
  __priority: string;
  __note: string;
  __date: string;
  __dateValid: boolean;
};

export type DashboardPayload = {
  rows: DashboardRow[];
  columns: string[];
  fetchedAt: string;
  source: "public-csv" | "service-account";
  spreadsheetId: string;
  sheetGid: string;
  sourceUrl: string;
  sheetTitle?: string;
  availableSheets: SheetInfo[];
};

export type SheetInfo = {
  gid: string;
  title: string;
};

export const normalizeHeader = (value: unknown) => String(value ?? "").trim().toLowerCase().replaceAll("ё", "е");
export const normalizeText = (value: unknown) => String(value ?? "").trim();

export function pick(row: RawRow, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value) return value;
  }
  return "";
}

export function parseDate(value: string): Date | null {
  if (!value) return null;
  const cleaned = value.trim();
  const parts = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (parts) {
    const year = Number(parts[3].length === 2 ? `20${parts[3]}` : parts[3]);
    const date = new Date(Date.UTC(year, Number(parts[2]) - 1, Number(parts[1])));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDashboardRows(rows: RawRow[]): DashboardRow[] {
  return rows.map((row, index) => {
    const dateRaw = pick(row, columnAliases.date);
    return {
      ...row,
      __id: `${pick(row, columnAliases.ticket) || "row"}-${index}`,
      __analyst: pick(row, columnAliases.analyst) || "Без ответственного",
      __ticket: pick(row, columnAliases.ticket),
      __title: pick(row, columnAliases.title) || Object.values(row).find(Boolean) || "Без названия",
      __status: pick(row, columnAliases.status) || "Без статуса",
      __priority: pick(row, columnAliases.priority) || "Без приоритета",
      __note: pick(row, columnAliases.note),
      __date: dateRaw,
      __dateValid: Boolean(parseDate(dateRaw)),
    };
  });
}

export function buildKpi(rows: DashboardRow[]) {
  const analysts = new Set(rows.map((row) => row.__analyst).filter((value) => value !== "Без ответственного"));
  const statuses = new Set(rows.map((row) => row.__status).filter((value) => value !== "Без статуса"));
  const withoutOwner = rows.filter((row) => row.__analyst === "Без ответственного").length;
  const invalidDates = rows.filter((row) => row.__date && !row.__dateValid).length;
  return { total: rows.length, analysts: analysts.size, statuses: statuses.size, withoutOwner, invalidDates };
}

export function groupCount(rows: DashboardRow[], key: keyof DashboardRow) {
  const map = new Map<string, number>();
  rows.forEach((row) => map.set(String(row[key] || "Не указано"), (map.get(String(row[key] || "Не указано")) || 0) + 1));
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
