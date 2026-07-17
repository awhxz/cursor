import { columnAliases } from "@/config/sheets";

export type RawRow = Record<string, string>;
// Dashboard rows include raw string cells plus computed validation flags.
export type DashboardRow = Record<string, string | boolean> & {
  __id: string;
  __analyst: string;
  __ticket: string;
  __title: string;
  __customer: string;
  __status: string;
  __area: string;
  __value: string;
  __analysisTime: string;
  __note: string;
  __ticketValid: boolean;
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

export const normalizeHeader = (value: unknown) => String(value ?? "").trim().toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ");
export const normalizeText = (value: unknown) => String(value ?? "").trim();

export function pick(row: RawRow, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value) return value;
  }
  return "";
}

function pickWithPositionFallback(row: RawRow, aliases: readonly string[], position: number) {
  return pick(row, aliases) || Object.values(row)[position] || "";
}

export const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());

export function scoreTone(value: string): "danger" | "orange" | "yellow" | "green" {
  if (value.trim() === "2") return "orange";
  if (value.trim() === "3") return "yellow";
  if (value.trim() === "4") return "green";
  return "danger";
}

export function toDashboardRows(rows: RawRow[]): DashboardRow[] {
  return rows.map((row, index) => {
    const ticket = pickWithPositionFallback(row, columnAliases.ticket, 0);
    return {
      ...row,
      __id: `${ticket || "row"}-${index}`,
      __analyst: pickWithPositionFallback(row, columnAliases.analyst, 3) || "Без ответственного",
      __ticket: ticket,
      __title: pickWithPositionFallback(row, columnAliases.title, 1) || "Без названия",
      __customer: pickWithPositionFallback(row, columnAliases.customer, 2) || "Без заказчика",
      __status: pickWithPositionFallback(row, columnAliases.status, 7) || "Без статуса",
      __area: pickWithPositionFallback(row, columnAliases.area, 4) || "Не указано",
      __value: pickWithPositionFallback(row, columnAliases.value, 5),
      __analysisTime: pickWithPositionFallback(row, columnAliases.analysisTime, 6),
      __note: pickWithPositionFallback(row, columnAliases.note, 8),
      __ticketValid: isHttpUrl(ticket),
    };
  });
}

export function buildKpi(rows: DashboardRow[]) {
  const analysts = new Set(rows.map((row) => row.__analyst).filter((value) => value !== "Без ответственного"));
  const customers = new Set(rows.map((row) => row.__customer).filter((value) => value !== "Без заказчика"));
  const statuses = new Set(rows.map((row) => row.__status).filter((value) => value !== "Без статуса"));
  const withoutOwner = rows.filter((row) => row.__analyst === "Без ответственного").length;
  const invalidTickets = rows.filter((row) => !row.__ticketValid).length;
  return { total: rows.length, analysts: analysts.size, customers: customers.size, statuses: statuses.size, withoutOwner, invalidTickets };
}

export function groupCount(rows: DashboardRow[], key: keyof DashboardRow) {
  const map = new Map<string, number>();
  rows.forEach((row) => map.set(String(row[key] || "Не указано"), (map.get(String(row[key] || "Не указано")) || 0) + 1));
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
