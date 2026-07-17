import { google, sheets_v4 } from "googleapis";
import Papa from "papaparse";
import { analyticsSheetGid, buildSheetUrl, dashboardColumnLimit, defaultSheetGid, spreadsheetId } from "@/config/sheets";
import { normalizeHeader, normalizeText, RawRow, toDashboardRows, DashboardPayload, SheetInfo } from "./dashboard-data";

function rowsFromMatrix(values: unknown[][]): { rows: RawRow[]; columns: string[] } {
  if (!values.length) return { rows: [], columns: [] };
  const relevantValues = values.map((row) => row.slice(0, dashboardColumnLimit));
  const usedColumns = new Set<string>();
  const columns = relevantValues[0].map((header, index) => {
    const normalized = normalizeHeader(header) || `столбец ${index + 1}`;
    const unique = usedColumns.has(normalized) ? `${normalized} (${index + 1})` : normalized;
    usedColumns.add(unique);
    return unique;
  });
  const rows = relevantValues.slice(1).map((raw) => {
    const row: RawRow = {};
    columns.forEach((column, index) => (row[column] = normalizeText(raw[index])));
    return row;
  }).filter((row) => Object.values(row).some(Boolean));
  return { rows, columns };
}

async function fetchPublicCsv(gid: string): Promise<DashboardPayload> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheets CSV вернул HTTP ${response.status}`);
  const text = await response.text();
  if (/<!doctype html|<html/i.test(text)) throw new Error("CSV endpoint вернул HTML вместо данных");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(parsed.errors[0].message);
  const { rows, columns } = rowsFromMatrix(parsed.data);
  return {
    rows: toDashboardRows(rows),
    columns,
    fetchedAt: new Date().toISOString(),
    source: "public-csv",
    spreadsheetId,
    sheetGid: gid,
    sourceUrl: buildSheetUrl(gid),
    availableSheets: [],
  };
}

function hasServiceAccountCredentials() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

function serviceAccountError(error: unknown) {
  const details = error instanceof Error ? error.message : "неизвестная ошибка Google API";
  if (/requested entity was not found|not found/i.test(details)) {
    return new Error(
      `Google Sheets API не видит таблицу ${spreadsheetId}. `
      + "Добавьте GOOGLE_SERVICE_ACCOUNT_EMAIL в доступы таблицы с ролью «Читатель».",
    );
  }
  return new Error(`Ошибка Google Sheets API: ${details}`);
}

function quoteSheetTitle(title: string) {
  return `'${title.replace(/'/g, "''")}'!A:I`;
}

async function getAvailableSheets(sheets: sheets_v4.Sheets): Promise<SheetInfo[]> {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title,hidden))",
  });
  return (metadata.data.sheets || [])
    .filter((sheet) => !sheet.properties?.hidden)
    .map((sheet) => ({
      gid: String(sheet.properties?.sheetId ?? ""),
      title: sheet.properties?.title || "Без названия",
    }))
    .filter((sheet) => sheet.gid);
}

function resolveServiceAccountSheet(availableSheets: SheetInfo[], requestedGid?: string) {
  if (!availableSheets.length) throw new Error("В Google Sheets не найдено видимых листов");
  return availableSheets.find((sheet) => sheet.gid === requestedGid)
    || availableSheets.find((sheet) => sheet.gid === analyticsSheetGid)
    || availableSheets[0];
}

async function fetchWithServiceAccount(requestedGid?: string): Promise<DashboardPayload> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Нет публичного доступа и не заданы GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  const auth = new google.auth.JWT({ email, key: privateKey, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const availableSheets = await getAvailableSheets(sheets);
  const selectedSheet = resolveServiceAccountSheet(availableSheets, requestedGid || defaultSheetGid);
  // Range is always built from current metadata. This avoids stale values such as "Лист1!A:I"
  // in Vercel environment variables causing Google API "Requested entity was not found" errors.
  const range = quoteSheetTitle(selectedSheet.title);
  const result = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const { rows, columns } = rowsFromMatrix((result.data.values || []) as unknown[][]);
  return {
    rows: toDashboardRows(rows),
    columns,
    fetchedAt: new Date().toISOString(),
    source: "service-account",
    spreadsheetId,
    sheetGid: selectedSheet.gid,
    sheetTitle: selectedSheet.title,
    sourceUrl: buildSheetUrl(selectedSheet.gid),
    availableSheets,
  };
}

export async function fetchSheetsData(requestedGid?: string): Promise<DashboardPayload> {
  const gid = requestedGid || defaultSheetGid;
  try {
    return await fetchPublicCsv(gid);
  } catch (error) {
    // If Vercel still contains an obsolete GOOGLE_SHEET_GID, retry the known "Актуальные"
    // tab before switching to service-account access.
    if (!requestedGid && gid !== analyticsSheetGid) {
      try {
        return await fetchPublicCsv(analyticsSheetGid);
      } catch (retryError) {
        // Continue to the secure service-account fallback below.
        void retryError;
      }
    }
    if (hasServiceAccountCredentials()) {
      try {
        return await fetchWithServiceAccount(requestedGid);
      } catch (serviceError) {
        throw serviceAccountError(serviceError);
      }
    }
    const details = error instanceof Error ? error.message : "неизвестная ошибка";
    throw new Error(`${details}. Таблица закрыта для публичного CSV: откройте доступ «Anyone with the link / Viewer» или добавьте service account переменные в Vercel.`);
  }
}
