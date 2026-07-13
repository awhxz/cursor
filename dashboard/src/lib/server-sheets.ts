import { google } from "googleapis";
import Papa from "papaparse";
import { sheetGid, spreadsheetId } from "@/config/sheets";
import { normalizeHeader, normalizeText, RawRow, toDashboardRows, DashboardPayload } from "./dashboard-data";

function rowsFromMatrix(values: unknown[][]): { rows: RawRow[]; columns: string[] } {
  if (!values.length) return { rows: [], columns: [] };
  const columns = values[0].map(normalizeHeader);
  const rows = values.slice(1).map((raw) => {
    const row: RawRow = {};
    columns.forEach((column, index) => (row[column] = normalizeText(raw[index])));
    return row;
  }).filter((row) => Object.values(row).some(Boolean));
  return { rows, columns };
}

async function fetchPublicCsv(): Promise<DashboardPayload> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${sheetGid}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheets CSV вернул HTTP ${response.status}`);
  const text = await response.text();
  if (/<!doctype html|<html/i.test(text)) throw new Error("CSV endpoint вернул HTML вместо данных");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(parsed.errors[0].message);
  const { rows, columns } = rowsFromMatrix(parsed.data);
  return { rows: toDashboardRows(rows), columns, fetchedAt: new Date().toISOString(), source: "public-csv" };
}

async function fetchWithServiceAccount(): Promise<DashboardPayload> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Нет публичного доступа и не заданы GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  const auth = new google.auth.JWT({ email, key: privateKey, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const range = process.env.GOOGLE_SHEET_RANGE || "A:Z";
  const result = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const { rows, columns } = rowsFromMatrix((result.data.values || []) as unknown[][]);
  return { rows: toDashboardRows(rows), columns, fetchedAt: new Date().toISOString(), source: "service-account" };
}

export async function fetchSheetsData(): Promise<DashboardPayload> {
  try {
    return await fetchPublicCsv();
  } catch (error) {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) return fetchWithServiceAccount();
    throw error;
  }
}
