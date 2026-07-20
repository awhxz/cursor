"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ColorTag, MultiSelect, ResponsibleTag } from "@/components/dashboard-ui";
import type { DashboardPayload, DashboardRow, SheetInfo } from "@/lib/dashboard-data";
import {
  analystPresentation,
  dashboardTabs,
  isQueueTask,
  metricPresentation,
  rowMatchesTab,
  statusTone,
  type DashboardTab,
} from "@/lib/dashboard-view";

const emptyPayload: DashboardPayload = {
  rows: [], columns: [], fetchedAt: "", source: "public-csv", spreadsheetId: "", sheetGid: "", sourceUrl: "", availableSheets: [],
};

type SortKey = "ticket" | "title" | "customer" | "analyst" | "area" | "status" | "priority" | "analysisTime" | "note";
type SortDirection = "asc" | "desc";

const sortValues: Record<SortKey, keyof DashboardRow> = {
  ticket: "__ticket", title: "__title", customer: "__customer", analyst: "__analyst", area: "__area",
  status: "__status", priority: "__value", analysisTime: "__analysisTime", note: "__note",
};

const customerExclusions = ["Баг", "Без заказчика"];
const areaExclusions = ["Баг/Недоработка", "Процессные задачи"];

function normalizeFilterValue(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е");
}

function uniqueFilterOptions(rows: DashboardRow[], key: keyof DashboardRow) {
  const values = new Map<string, string>();
  rows.forEach((row) => {
    const display = String(row[key] ?? "").replace(/\u00a0/g, " ").replace(/[\u200b-\u200d\ufeff]/g, "").trim().replace(/\s+/g, " ");
    const normalized = normalizeFilterValue(display);
    if (normalized && !values.has(normalized)) values.set(normalized, display);
  });
  return Array.from(values.values()).sort((left, right) => left.localeCompare(right, "ru", { sensitivity: "base" }));
}

function excludes(values: readonly string[]) {
  const excluded = new Set(values.map(normalizeFilterValue));
  return (option: string) => !excluded.has(normalizeFilterValue(option));
}

function sameSelection(left: string[], right: string[]) {
  const leftValues = new Set(left.map(normalizeFilterValue));
  const rightValues = new Set(right.map(normalizeFilterValue));
  return leftValues.size === rightValues.size && Array.from(leftValues).every((value) => rightValues.has(value));
}

function reconcileSelection(selected: string[], options: string[], previousOptions: string[], allowed: (value: string) => boolean) {
  const selectedValues = new Set(selected.map(normalizeFilterValue));
  const previousValues = new Set(previousOptions.map(normalizeFilterValue));
  return options.filter((option) => selectedValues.has(normalizeFilterValue(option)) || (!previousValues.has(normalizeFilterValue(option)) && allowed(option)));
}

function exclusionSummary(label: string, options: string[], exclusions: readonly string[]) {
  const optionValues = new Set(options.map(normalizeFilterValue));
  const present = exclusions.filter((value) => optionValues.has(normalizeFilterValue(value)));
  return present.length ? `${label}: кроме ${present.join(", ")}` : "Все";
}

async function requestSheet(gid?: string): Promise<DashboardPayload> {
  const params = new URLSearchParams({ ts: String(Date.now()) });
  if (gid) params.set("gid", gid);
  const response = await fetch(`/api/sheets?${params.toString()}`, { cache: "no-store" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Ошибка загрузки данных");
  return json;
}

function sheetForTab(catalog: SheetInfo[], tab: DashboardTab) {
  const tabConfig = dashboardTabs.find((item) => item.key === tab);
  const configuredSheet = tabConfig?.sheetGid
    ? catalog.find((sheet) => sheet.gid === tabConfig.sheetGid)
    : undefined;
  const title = tabConfig?.sheetTitle?.toLowerCase();
  return configuredSheet || (title ? catalog.find((sheet) => {
    const sheetTitle = sheet.title.toLowerCase();
    return sheetTitle === title || sheetTitle.includes(title) || title.includes(sheetTitle);
  }) : undefined);
}

function combinePayloads(payloads: DashboardPayload[], catalog: SheetInfo[]): DashboardPayload {
  const first = payloads[0];
  return {
    ...first,
    rows: payloads.flatMap((payload) => payload.rows.map((row) => ({ ...row, __id: `${payload.sheetGid}-${row.__id}` }))),
    fetchedAt: new Date().toISOString(),
    sheetGid: "",
    sheetTitle: "Все листы",
    sourceUrl: `https://docs.google.com/spreadsheets/d/${first.spreadsheetId}/edit`,
    availableSheets: catalog,
  };
}

export default function DashboardPage() {
  const [payload, setPayload] = useState<DashboardPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("actual");
  const [customer, setCustomer] = useState<string[]>([]);
  const [analyst, setAnalyst] = useState<string[]>([]);
  const [area, setArea] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const catalogRef = useRef<SheetInfo[]>([]);
  const filterTabRef = useRef<DashboardTab | null>(null);
  const previousFilterOptions = useRef<{ customers: string[]; analysts: string[]; areas: string[]; statuses: string[] } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const catalog = catalogRef.current;
      if (activeTab === "all") {
        const sheets = dashboardTabs
          .filter((tab) => tab.sheetGid)
          .map((tab) => ({ gid: sheetForTab(catalog, tab.key)?.gid || tab.sheetGid! }));
        const results = await Promise.all(sheets.map((sheet) => requestSheet(sheet.gid)));
        if (results.length) {
          const availableSheets = results.find((result) => result.availableSheets.length)?.availableSheets || catalog;
          if (availableSheets.length) catalogRef.current = availableSheets;
          setPayload(combinePayloads(results, availableSheets));
          return;
        }
      }

      const targetSheet = sheetForTab(catalog, activeTab);
      const configuredGid = dashboardTabs.find((tab) => tab.key === activeTab)?.sheetGid;
      const result = await requestSheet(targetSheet?.gid || configuredGid);
      if (result.availableSheets?.length) catalogRef.current = result.availableSheets;
      setPayload(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить данные");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadData]);

  const rowsForTab = useMemo(() => payload.rows.filter((row) => rowMatchesTab(row, activeTab)), [payload.rows, activeTab]);
  const customers = useMemo(() => uniqueFilterOptions(rowsForTab, "__customer"), [rowsForTab]);
  const analysts = useMemo(() => uniqueFilterOptions(rowsForTab, "__analyst"), [rowsForTab]);
  const areas = useMemo(() => uniqueFilterOptions(rowsForTab, "__area"), [rowsForTab]);
  const statuses = useMemo(() => uniqueFilterOptions(rowsForTab, "__status"), [rowsForTab]);
  const defaultCustomers = useMemo(() => customers.filter(excludes(customerExclusions)), [customers]);
  const defaultAreas = useMemo(() => areas.filter(excludes(areaExclusions)), [areas]);

  useEffect(() => {
    if (loading) return;
    const current = { customers, analysts, areas, statuses };
    const previous = filterTabRef.current === activeTab ? previousFilterOptions.current : null;
    if (!previous) {
      setCustomer(defaultCustomers);
      setAnalyst(analysts);
      setArea(defaultAreas);
      setStatus(statuses);
    } else {
      setCustomer((selected) => reconcileSelection(selected, customers, previous.customers, excludes(customerExclusions)));
      setAnalyst((selected) => reconcileSelection(selected, analysts, previous.analysts, () => true));
      setArea((selected) => reconcileSelection(selected, areas, previous.areas, excludes(areaExclusions)));
      setStatus((selected) => reconcileSelection(selected, statuses, previous.statuses, () => true));
    }
    filterTabRef.current = activeTab;
    previousFilterOptions.current = current;
  }, [activeTab, loading, customers, analysts, areas, statuses, defaultCustomers, defaultAreas]);

  const filtered = useMemo(() => rowsForTab.filter((row) => {
    const haystack = [row.__ticket, row.__title, row.__customer, row.__analyst, row.__area, row.__status, row.__note].join(" ").toLowerCase();
    const selectedCustomers = new Set(customer.map(normalizeFilterValue));
    const selectedAnalysts = new Set(analyst.map(normalizeFilterValue));
    const selectedAreas = new Set(area.map(normalizeFilterValue));
    const selectedStatuses = new Set(status.map(normalizeFilterValue));
    return selectedCustomers.has(normalizeFilterValue(row.__customer))
      && selectedAnalysts.has(normalizeFilterValue(row.__analyst))
      && selectedAreas.has(normalizeFilterValue(row.__area))
      && selectedStatuses.has(normalizeFilterValue(row.__status))
      && haystack.includes(query.trim().toLowerCase());
  }), [rowsForTab, customer, analyst, area, status, query]);

  const sorted = useMemo(() => [...filtered].sort((left, right) => {
    const key = sortValues[sortKey];
    const result = String(left[key] ?? "").localeCompare(String(right[key] ?? ""), "ru", { numeric: true, sensitivity: "base" });
    return sortDirection === "asc" ? result : -result;
  }), [filtered, sortDirection, sortKey]);

  const separateQueue = activeTab === "actual";
  const queueRows = useMemo(() => separateQueue ? sorted.filter(isQueueTask) : [], [separateQueue, sorted]);
  const mainRows = useMemo(() => separateQueue ? sorted.filter((row) => !isQueueTask(row)) : sorted, [separateQueue, sorted]);
  const groups = useMemo(() => groupByAnalyst(mainRows), [mainRows]);
  const groupByResponsible = activeTab === "actual";
  const filtersChanged = !sameSelection(customer, defaultCustomers) || !sameSelection(analyst, analysts)
    || !sameSelection(area, defaultAreas) || !sameSelection(status, statuses) || Boolean(query);
  const resetFilters = () => { setCustomer(defaultCustomers); setAnalyst(analysts); setArea(defaultAreas); setStatus(statuses); setQuery(""); };
  const changeTab = (tab: DashboardTab) => { setQuery(""); filterTabRef.current = null; previousFilterOptions.current = null; setActiveTab(tab); };
  const changeSort = (key: SortKey) => { if (sortKey === key) setSortDirection((current) => current === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDirection("asc"); } };
  const updatedAt = payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  const sourceTag = payload.sheetGid ? `gid ${payload.sheetGid}` : payload.sheetTitle || "Google Sheets";

  return <main className="dashboardShell">
    <header className="dashboardHeader">
      <div className="headerCopy">
        <p className="eyebrow">GOOGLE SHEETS → ВЕБ-ДАШБОРД</p>
        <h1>Задачи в аналитике</h1>
        <p className="subtitle">Актуальная сводка по задачам без ручной выгрузки Excel</p>
        {payload.sourceUrl && <p className="sourceLine">Источник: <a href={payload.sourceUrl} target="_blank" rel="noreferrer">открыть Google Sheets</a><span className="sourceTag">{sourceTag}</span></p>}
      </div>
      <div className="refreshPanel">
        <button className="refreshButton" onClick={loadData} disabled={loading}><RefreshIcon />{loading ? "Обновляем…" : "Обновить данные"}</button>
        <span>Обновлено: {updatedAt}</span>
      </div>
    </header>

    {error && <section className="notice errorNotice"><div><strong>Не удалось загрузить данные</strong><p>{error}</p></div><button onClick={loadData}>Повторить</button></section>}

    <section className="workspace" aria-busy={loading}>
      <nav className="tabs" aria-label="Разделы задач">
        {dashboardTabs.map((tab) => <button key={tab.key} className={activeTab === tab.key ? "tab active" : "tab"} onClick={() => changeTab(tab.key)} aria-current={activeTab === tab.key ? "page" : undefined}>{tab.label}</button>)}
      </nav>

      <div className="controls">
        <label className="searchControl"><span className="srOnly">Поиск</span><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по тикету, названию или комментарию" /></label>
        <div className="filterGrid">
          <MultiSelect label="Заказчик" options={customers} selected={customer} onChange={setCustomer} disabled={loading && !payload.rows.length} summaryLabel={sameSelection(customer, defaultCustomers) ? exclusionSummary("Заказчик", customers, customerExclusions) : undefined} />
          <MultiSelect label="Ответственный" options={analysts} selected={analyst} onChange={setAnalyst} disabled={loading && !payload.rows.length} />
          <MultiSelect label="К чему относится" options={areas} selected={area} onChange={setArea} disabled={loading && !payload.rows.length} summaryLabel={sameSelection(area, defaultAreas) ? exclusionSummary("К чему относится", areas, areaExclusions) : undefined} />
          <MultiSelect label="Статус" options={statuses} selected={status} onChange={setStatus} disabled={loading && !payload.rows.length} />
          <button className="resetButton" onClick={resetFilters} title="Сбросить фильтры" disabled={!filtersChanged}><ResetIcon />Сбросить</button>
        </div>
      </div>

      {loading && !payload.rows.length && <div className="notice loadingNotice"><span className="spinner" />Загружаем актуальные задачи…</div>}
      {!loading && !error && !filtered.length && <div className="emptyState"><strong>Задачи не найдены</strong><span>Измените поиск или сбросьте фильтры.</span></div>}

      {filtered.length > 0 && <>
        {mainRows.length > 0 && <section className="tableSection">
          <div className="sectionHeader"><div><h2>{dashboardTabs.find((tab) => tab.key === activeTab)?.label}</h2><span>{mainRows.length} {taskWord(mainRows.length)}</span></div></div>
          <div className="tableScroll"><table className="taskTable">
            {groupByResponsible
              ? <><MainTableHead sortKey={sortKey} direction={sortDirection} onSort={changeSort}/><tbody>{groups.map((group) => <AnalystGroup key={group.name} name={group.name} rows={group.rows} />)}</tbody></>
              : <><QueueTableHead sortKey={sortKey} direction={sortDirection} onSort={changeSort}/><tbody>{mainRows.map((row) => <TaskRow key={row.__id} row={row} showAnalyst />)}</tbody></>}
          </table></div>
        </section>}

        {queueRows.length > 0 && <section className="tableSection queueSection">
          <div className="sectionHeader"><div><h2>Задачи в очереди</h2><span>{queueRows.length} {taskWord(queueRows.length)}</span></div></div>
          <div className="tableScroll"><table className="taskTable queueTable"><QueueTableHead sortKey={sortKey} direction={sortDirection} onSort={changeSort}/><tbody>{queueRows.map((row) => <TaskRow key={row.__id} row={row} showAnalyst />)}</tbody></table></div>
        </section>}
      </>}
    </section>
  </main>;
}

function groupByAnalyst(rows: DashboardRow[]) {
  const map = new Map<string, DashboardRow[]>();
  rows.forEach((row) => map.set(row.__analyst, [...(map.get(row.__analyst) || []), row]));
  return Array.from(map, ([name, groupedRows]) => ({ name, rows: groupedRows, meta: analystPresentation(name) }))
    .sort((left, right) => left.meta.order - right.meta.order || left.meta.label.localeCompare(right.meta.label, "ru"));
}

function taskWord(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "задач";
  if (last === 1) return "задача";
  if (last >= 2 && last <= 4) return "задачи";
  return "задач";
}

function MainTableHead({ sortKey, direction, onSort }: SortHeadProps) {
  return <thead><tr><SortHeader label="Тикет" column="ticket" {...{ sortKey, direction, onSort }} /><SortHeader label="Название" column="title" {...{ sortKey, direction, onSort }} /><SortHeader label="Заказчик" column="customer" {...{ sortKey, direction, onSort }} /><SortHeader label="К чему относится" column="area" {...{ sortKey, direction, onSort }} /><SortHeader label="Статус" column="status" {...{ sortKey, direction, onSort }} /><SortHeader label="Приоритет" column="priority" {...{ sortKey, direction, onSort }} /><SortHeader label="Время в аналитике" column="analysisTime" {...{ sortKey, direction, onSort }} /><SortHeader label="Комментарий" column="note" {...{ sortKey, direction, onSort }} /></tr></thead>;
}

function QueueTableHead({ sortKey, direction, onSort }: SortHeadProps) {
  return <thead><tr><SortHeader label="Тикет" column="ticket" {...{ sortKey, direction, onSort }} /><SortHeader label="Название" column="title" {...{ sortKey, direction, onSort }} /><SortHeader label="Заказчик" column="customer" {...{ sortKey, direction, onSort }} /><SortHeader label="Ответственный" column="analyst" {...{ sortKey, direction, onSort }} /><SortHeader label="К чему относится" column="area" {...{ sortKey, direction, onSort }} /><SortHeader label="Статус" column="status" {...{ sortKey, direction, onSort }} /><SortHeader label="Приоритет" column="priority" {...{ sortKey, direction, onSort }} /><SortHeader label="Время" column="analysisTime" {...{ sortKey, direction, onSort }} /><SortHeader label="Комментарий" column="note" {...{ sortKey, direction, onSort }} /></tr></thead>;
}

type SortHeadProps = { sortKey: SortKey; direction: SortDirection; onSort: (key: SortKey) => void };
function SortHeader({ label, column, sortKey, direction, onSort }: { label: string; column: SortKey } & SortHeadProps) {
  const active = sortKey === column;
  return <th aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}><button className="sortButton" onClick={() => onSort(column)}>{label}<span>{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span></button></th>;
}

function AnalystGroup({ name, rows }: { name: string; rows: DashboardRow[] }) {
  return <><tr className="analystGroup"><td colSpan={8}><div><ResponsibleTag value={name} /><span className="groupCount">{rows.length} {taskWord(rows.length)}</span></div></td></tr>{rows.map((row) => <TaskRow key={row.__id} row={row} />)}</>;
}

function TaskRow({ row, showAnalyst = false }: { row: DashboardRow; showAnalyst?: boolean }) {
  return <tr className="taskRow">
    <td className="ticketCell"><div className="cellContent">{row.__ticketValid ? <a href={row.__ticket} target="_blank" rel="noreferrer">{row.__ticket}</a> : (row.__ticket || "—")}</div></td>
    <td className="titleCell"><div className="cellContent">{row.__title || "—"}</div></td>
    <td><div className="cellContent">{row.__customer || "—"}</div></td>
    {showAnalyst && <td><div className="cellContent"><ResponsibleTag value={row.__analyst} compact /></div></td>}
    <td><div className="cellContent">{row.__area || "—"}</div></td>
    <td><div className="cellContent"><StatusTag value={row.__status} /></div></td>
    <td><div className="cellContent"><MetricTag value={row.__value} label="Приоритет" /></div></td>
    <td><div className="cellContent"><MetricTag value={row.__analysisTime} label="Время в аналитике" /></div></td>
    <td className="commentCell"><div className="cellContent">{row.__note || "—"}</div></td>
  </tr>;
}

function StatusTag({ value }: { value: string }) { return <ColorTag tone={statusTone(value)} className="statusTag">{value || "—"}</ColorTag>; }
function MetricTag({ value, label }: { value: string; label: string }) { const metric = metricPresentation(value, label); return <ColorTag tone={metric.tone} className="metricTag"><span tabIndex={0} data-tooltip={metric.tooltip}>{metric.text}</span></ColorTag>; }

function SearchIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m17 17-3.7-3.7m1.7-4.1a5.8 5.8 0 1 1-11.6 0 5.8 5.8 0 0 1 11.6 0Z" /></svg>; }
function RefreshIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 6.5A6.5 6.5 0 1 0 16.2 13M16 3v3.5h-3.5" /></svg>; }
function ResetIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M7 6V4h6v2m-7 0 .7 10h6.6L14 6M8.5 9v4m3-4v4" /></svg>; }
