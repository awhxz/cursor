"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ColorTag, MultiSelect, ResponsibleTag } from "@/components/multi-select";
import type { DashboardPayload, DashboardRow, SheetInfo } from "@/lib/dashboard-data";
import {
  analystPresentation,
  dashboardTabs,
  defaultClientExclusions,
  defaultDirectionExclusions,
  defaultFilterSelection,
  isQueueTask,
  metricPresentation,
  reconcileFilterSelection,
  rowMatchesTab,
  rowMatchesSelections,
  sameFilterSelection,
  type DashboardTab,
} from "@/lib/dashboard-view";

const emptyPayload: DashboardPayload = {
  rows: [], columns: [], fetchedAt: "", source: "public-csv", spreadsheetId: "", sheetGid: "", sourceUrl: "", availableSheets: [],
};

type SortKey = "ticket" | "title" | "customer" | "analyst" | "area" | "status" | "priority" | "analysisTime" | "note";
type SortDirection = "asc" | "desc";
const noDefaultExclusions: string[] = [];

const sortValues: Record<SortKey, keyof DashboardRow> = {
  ticket: "__ticket", title: "__title", customer: "__customer", analyst: "__analyst", area: "__area",
  status: "__status", priority: "__value", analysisTime: "__analysisTime", note: "__note",
};

async function requestSheet(gid?: string): Promise<DashboardPayload> {
  const params = new URLSearchParams({ ts: String(Date.now()) });
  if (gid) params.set("gid", gid);
  const response = await fetch(`/api/sheets?${params.toString()}`, { cache: "no-store" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Ошибка загрузки данных");
  return json;
}

function sheetForTab(catalog: SheetInfo[], tab: DashboardTab) {
  const title = dashboardTabs.find((item) => item.key === tab)?.sheetTitle?.toLowerCase();
  return title ? catalog.find((sheet) => {
    const sheetTitle = sheet.title.toLowerCase();
    return sheetTitle === title || sheetTitle.includes(title) || title.includes(sheetTitle);
  }) : undefined;
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
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const catalogRef = useRef<SheetInfo[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const catalog = catalogRef.current;
      if (activeTab === "all" && catalog.length) {
        const sheets = dashboardTabs
          .filter((tab) => tab.sheetTitle)
          .map((tab) => sheetForTab(catalog, tab.key))
          .filter((sheet): sheet is SheetInfo => Boolean(sheet));
        const results = await Promise.all(sheets.map((sheet) => requestSheet(sheet.gid)));
        if (results.length) {
          setPayload(combinePayloads(results, catalog));
          return;
        }
      }

      const targetSheet = sheetForTab(catalog, activeTab);
      const result = await requestSheet(targetSheet?.gid);
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
  const filterOptions = useCallback((key: keyof DashboardRow) => Array.from(new Set(rowsForTab.map((row) => String(row[key])))).sort(), [rowsForTab]);
  const clients = useMemo(() => filterOptions("__customer"), [filterOptions]);
  const responsibles = useMemo(() => filterOptions("__analyst"), [filterOptions]);
  const directions = useMemo(() => filterOptions("__area"), [filterOptions]);
  const statuses = useMemo(() => filterOptions("__status"), [filterOptions]);
  const clientFilter = useDynamicMultiSelection(clients, defaultClientExclusions);
  const responsibleFilter = useDynamicMultiSelection(responsibles);
  const directionFilter = useDynamicMultiSelection(directions, defaultDirectionExclusions);
  const statusFilter = useDynamicMultiSelection(statuses);

  const filtered = useMemo(() => rowsForTab.filter((row) => rowMatchesSelections(row, {
    clients: clientFilter.selected,
    responsibles: responsibleFilter.selected,
    directions: directionFilter.selected,
    statuses: statusFilter.selected,
  }, query)), [rowsForTab, clientFilter.selected, responsibleFilter.selected, directionFilter.selected, statusFilter.selected, query]);

  const sorted = useMemo(() => [...filtered].sort((left, right) => {
    const key = sortValues[sortKey];
    const result = String(left[key] ?? "").localeCompare(String(right[key] ?? ""), "ru", { numeric: true, sensitivity: "base" });
    return sortDirection === "asc" ? result : -result;
  }), [filtered, sortDirection, sortKey]);

  const queueRows = useMemo(() => sorted.filter(isQueueTask), [sorted]);
  const mainRows = useMemo(() => sorted.filter((row) => !isQueueTask(row)), [sorted]);
  const groups = useMemo(() => groupByAnalyst(mainRows), [mainRows]);
  const filtersChanged = activeTab !== "actual" || Boolean(query.trim())
    || !clientFilter.isDefault
    || !responsibleFilter.isDefault
    || !directionFilter.isDefault
    || !statusFilter.isDefault;
  const resetFilters = () => { clientFilter.reset(); responsibleFilter.reset(); directionFilter.reset(); statusFilter.reset(); setQuery(""); setActiveTab("actual"); };
  const changeTab = (tab: DashboardTab) => setActiveTab(tab);
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
          <MultiSelect label="Заказчик" options={clients} selected={clientFilter.selected} onChange={clientFilter.setSelected} renderOption={(option) => <ColorTag value={option} />} />
          <MultiSelect label="Ответственный" options={responsibles} selected={responsibleFilter.selected} onChange={responsibleFilter.setSelected} renderOption={(option) => <ResponsibleTag value={option} compact />} />
          <MultiSelect label="К чему относится" options={directions} selected={directionFilter.selected} onChange={directionFilter.setSelected} renderOption={(option) => <ColorTag value={option} />} />
          <MultiSelect label="Статус" options={statuses} selected={statusFilter.selected} onChange={statusFilter.setSelected} renderOption={(option) => <ColorTag value={option} kind="status" />} />
          {filtersChanged && <button className="resetButton" onClick={resetFilters} title="Сбросить фильтры"><ResetIcon />Сбросить</button>}
        </div>
      </div>

      {loading && !payload.rows.length && <div className="notice loadingNotice"><span className="spinner" />Загружаем актуальные задачи…</div>}
      {!loading && !error && !filtered.length && <div className="emptyState"><strong>Задачи не найдены</strong><span>Измените поиск или сбросьте фильтры.</span></div>}

      {filtered.length > 0 && <>
        {mainRows.length > 0 && <section className="tableSection">
          <div className="sectionHeader"><div><h2>{dashboardTabs.find((tab) => tab.key === activeTab)?.label}</h2><span>{mainRows.length} {taskWord(mainRows.length)}</span></div></div>
          <div className="tableScroll"><table className="taskTable"><MainTableHead sortKey={sortKey} direction={sortDirection} onSort={changeSort}/><tbody>
            {groups.map((group) => <AnalystGroup key={group.name} name={group.name} rows={group.rows} />)}
          </tbody></table></div>
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

function useDynamicMultiSelection(options: string[], excludedValues: string[] = noDefaultExclusions) {
  const [userSelection, setUserSelection] = useState<string[] | null>(null);
  const previousOptions = useRef<string[]>([]);
  const defaultSelection = useMemo(() => defaultFilterSelection(options, excludedValues), [options, excludedValues]);
  const selected = useMemo(() => userSelection === null
    ? defaultSelection
    : reconcileFilterSelection(previousOptions.current, options, userSelection, excludedValues), [userSelection, defaultSelection, options, excludedValues]);

  useEffect(() => {
    if (userSelection !== null && !sameFilterSelection(userSelection, selected)) setUserSelection(selected);
    previousOptions.current = options;
  }, [options, selected, userSelection]);

  const setSelected = useCallback((next: string[]) => {
    setUserSelection(sameFilterSelection(next, defaultSelection) ? null : next);
  }, [defaultSelection]);
  const reset = useCallback(() => setUserSelection(null), []);
  return { selected, setSelected, reset, isDefault: sameFilterSelection(selected, defaultSelection) };
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
    <td className="ticketCell">{row.__ticketValid ? <a href={row.__ticket} target="_blank" rel="noreferrer">{row.__ticket}</a> : (row.__ticket || "—")}</td>
    <td className="titleCell">{row.__title || "—"}</td>
    <td><ColorTag value={row.__customer} /></td>
    {showAnalyst && <td><ResponsibleTag value={row.__analyst} compact /></td>}
    <td><ColorTag value={row.__area} /></td>
    <td><ColorTag value={row.__status} kind="status" /></td>
    <td><MetricTag value={row.__value} label="Приоритет" /></td>
    <td><MetricTag value={row.__analysisTime} label="Время в аналитике" /></td>
    <td className="commentCell">{row.__note || "—"}</td>
  </tr>;
}

function MetricTag({ value, label }: { value: string; label: string }) { const metric = metricPresentation(value, label); return <span className={`metricTag tone-${metric.tone}`} tabIndex={0} data-tooltip={metric.tooltip}>{metric.text}</span>; }

function SearchIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m17 17-3.7-3.7m1.7-4.1a5.8 5.8 0 1 1-11.6 0 5.8 5.8 0 0 1 11.6 0Z" /></svg>; }
function RefreshIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 6.5A6.5 6.5 0 1 0 16.2 13M16 3v3.5h-3.5" /></svg>; }
function ResetIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M7 6V4h6v2m-7 0 .7 10h6.6L14 6M8.5 9v4m3-4v4" /></svg>; }
