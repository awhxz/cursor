"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardPayload, DashboardRow } from "@/lib/dashboard-data";
import { buildKpi, groupCount, scoreTone } from "@/lib/dashboard-data";

const COLORS = ["#315c7f", "#6f91a9", "#97b6a4", "#d4a373", "#c77d7d", "#8f88a8"];
const emptyPayload: DashboardPayload = {
  rows: [], columns: [], fetchedAt: "", source: "public-csv", spreadsheetId: "", sheetGid: "", sourceUrl: "", availableSheets: [],
};

type SortKey = "ticket" | "title" | "customer" | "analyst" | "area" | "value" | "analysisTime" | "status" | "note";
type SortDirection = "asc" | "desc";

const sortValues: Record<SortKey, keyof DashboardRow> = {
  ticket: "__ticket", title: "__title", customer: "__customer", analyst: "__analyst", area: "__area",
  value: "__value", analysisTime: "__analysisTime", status: "__status", note: "__note",
};

export default function DashboardPage() {
  const [payload, setPayload] = useState<DashboardPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState("Все");
  const [analyst, setAnalyst] = useState("Все");
  const [area, setArea] = useState("Все");
  const [valueScore, setValueScore] = useState("Все");
  const [analysisTime, setAnalysisTime] = useState("Все");
  const [status, setStatus] = useState("Все");
  const [query, setQuery] = useState("");
  const [selectedGid, setSelectedGid] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ ts: String(Date.now()) });
      if (selectedGid) params.set("gid", selectedGid);
      const response = await fetch(`/api/sheets?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Ошибка загрузки данных");
      setPayload(json);
      if (json.sheetGid && json.sheetGid !== selectedGid) setSelectedGid(json.sheetGid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить данные");
    } finally {
      setLoading(false);
    }
  }, [selectedGid]);

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadData]);

  const options = useCallback((key: keyof DashboardRow) => ["Все", ...Array.from(new Set(payload.rows.map((row) => String(row[key])))).sort()], [payload.rows]);
  const customers = useMemo(() => options("__customer"), [options]);
  const analysts = useMemo(() => options("__analyst"), [options]);
  const areas = useMemo(() => options("__area"), [options]);
  const valueScores = useMemo(() => options("__value"), [options]);
  const analysisTimes = useMemo(() => options("__analysisTime"), [options]);
  const statuses = useMemo(() => options("__status"), [options]);

  const filtered = useMemo(() => payload.rows.filter((row) => {
    const haystack = Object.values(row).join(" ").toLowerCase();
    return (customer === "Все" || row.__customer === customer)
      && (analyst === "Все" || row.__analyst === analyst)
      && (area === "Все" || row.__area === area)
      && (valueScore === "Все" || row.__value === valueScore)
      && (analysisTime === "Все" || row.__analysisTime === analysisTime)
      && (status === "Все" || row.__status === status)
      && haystack.includes(query.trim().toLowerCase());
  }), [payload.rows, customer, analyst, area, valueScore, analysisTime, status, query]);

  const sorted = useMemo(() => [...filtered].sort((left, right) => {
    const key = sortValues[sortKey];
    const leftValue = String(left[key] ?? "");
    const rightValue = String(right[key] ?? "");
    const result = leftValue.localeCompare(rightValue, "ru", { numeric: true, sensitivity: "base" });
    return sortDirection === "asc" ? result : -result;
  }), [filtered, sortDirection, sortKey]);

  const kpi = buildKpi(filtered);
  const byAnalyst = groupCount(filtered, "__analyst").slice(0, 8);
  const byStatus = groupCount(filtered, "__status").slice(0, 8);
  const resetFilters = () => { setCustomer("Все"); setAnalyst("Все"); setArea("Все"); setValueScore("Все"); setAnalysisTime("Все"); setStatus("Все"); setQuery(""); };
  const changeSort = (key: SortKey) => { if (sortKey === key) setSortDirection((current) => current === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDirection("asc"); } };
  const sheetName = payload.sheetTitle || (payload.sheetGid ? `gid ${payload.sheetGid}` : "лист не выбран");

  return <main className="shell">
    <section className="hero">
      <div><p className="eyebrow">Google Sheets → веб-дашборд</p><h1>Дашборд руководителя</h1><p className="muted">Актуальная сводка по задачам без ручной выгрузки Excel.</p>{payload.sourceUrl && <p className="source">Источник: <a href={payload.sourceUrl} target="_blank" rel="noreferrer">открыть Google Sheets</a><span>{sheetName}</span></p>}</div>
      <div className="refresh"><button onClick={loadData} disabled={loading}>{loading ? "Обновляем…" : "Обновить данные"}</button><span>{payload.fetchedAt ? `Обновлено: ${new Date(payload.fetchedAt).toLocaleString("ru-RU")}` : "Данные еще не загружены"}</span></div>
    </section>

    <nav className="dashboardTabs" aria-label="Разделы дашборда"><button className="dashboardTab active" aria-current="page">Задачи в аналитике</button></nav>
    {error && <section className="state error"><b>Не удалось загрузить данные.</b><span>{error}</span><button onClick={loadData}>Повторить</button></section>}
    {loading && <section className="state">Загружаем актуальные задачи…</section>}

    <section className="filters">
      {payload.availableSheets.length > 0 && <Filter label="Лист Google Sheets" value={selectedGid || payload.sheetGid} values={payload.availableSheets.map((sheet) => sheet.gid)} labels={Object.fromEntries(payload.availableSheets.map((sheet) => [sheet.gid, sheet.title]))} onChange={(value) => { setSelectedGid(value); resetFilters(); }} />}
      <Filter label="Заказчик" value={customer} values={customers} onChange={setCustomer} />
      <Filter label="Ответственный" value={analyst} values={analysts} onChange={setAnalyst} />
      <Filter label="К чему относится" value={area} values={areas} onChange={setArea} />
      <Filter label="Ценность" value={valueScore} values={valueScores} onChange={setValueScore} />
      <Filter label="Время в аналитике" value={analysisTime} values={analysisTimes} onChange={setAnalysisTime} />
      <Filter label="Статус" value={status} values={statuses} onChange={setStatus} />
      <label>Поиск<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Тикет, название, комментарий" /></label>
      <button className="secondary" onClick={resetFilters}>Сбросить фильтры</button>
    </section>

    {!loading && !error && !payload.rows.length && <section className="state">В выбранном листе нет задач для отображения.</section>}

    <section className="kpis"><Kpi title="Всего задач" value={kpi.total} /><Kpi title="Ответственных" value={kpi.analysts} /><Kpi title="Заказчиков" value={kpi.customers} /><Kpi title="Без ответственного" value={kpi.withoutOwner} /><Kpi title="Неверных ссылок" value={kpi.invalidTickets} /></section>

    <section className="grid">
      <ChartCard title="Задачи по ответственным"><ResponsiveContainer width="100%" height={280}><BarChart data={byAnalyst}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="value" fill="#315c7f" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Задачи по статусам"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={byStatus} dataKey="value" nameKey="name" outerRadius={100} label>{byStatus.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
    </section>

    <section className="tableCard"><div className="tableHead"><div><h2>Задачи в аналитике</h2><p>Первые 9 столбцов листа; недельные столбцы не загружаются.</p></div><span>Показано: {sorted.length}</span></div><div className="tableWrap"><table><thead><tr>
      <SortHeader label="Тикет" column="ticket" active={sortKey} direction={sortDirection} onSort={changeSort}/><SortHeader label="Название" column="title" active={sortKey} direction={sortDirection} onSort={changeSort}/><SortHeader label="Заказчик" column="customer" active={sortKey} direction={sortDirection} onSort={changeSort}/><SortHeader label="Ответственный" column="analyst" active={sortKey} direction={sortDirection} onSort={changeSort}/><SortHeader label="К чему относится" column="area" active={sortKey} direction={sortDirection} onSort={changeSort}/><SortHeader label="Ценность" column="value" active={sortKey} direction={sortDirection} onSort={changeSort}/><SortHeader label="Время в аналитике" column="analysisTime" active={sortKey} direction={sortDirection} onSort={changeSort}/><SortHeader label="Статус" column="status" active={sortKey} direction={sortDirection} onSort={changeSort}/><SortHeader label="Комментарий" column="note" active={sortKey} direction={sortDirection} onSort={changeSort}/>
    </tr></thead><tbody>{sorted.map((row) => <TaskRow key={row.__id} row={row}/>)}</tbody></table></div></section>
  </main>;
}

function Filter({ label, value, values, labels, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) { return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{values.map((item) => <option key={item} value={item}>{labels?.[item] || item}</option>)}</select></label>; }
function Kpi({ title, value }: { title: string; value: number }) { return <article className="kpi"><span>{title}</span><strong>{value}</strong></article>; }
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) { return <article className="card"><h2>{title}</h2>{children}</article>; }
function SortHeader({ label, column, active, direction, onSort }: { label: string; column: SortKey; active: SortKey; direction: SortDirection; onSort: (key: SortKey) => void }) { const selected = active === column; return <th aria-sort={selected ? (direction === "asc" ? "ascending" : "descending") : "none"}><button className="sortButton" onClick={() => onSort(column)}>{label}<span>{selected ? (direction === "asc" ? "↑" : "↓") : "↕"}</span></button></th>; }
function ScoreBadge({ value }: { value: string }) { return <span className={`score ${scoreTone(value)}`} title={value ? `Значение: ${value}` : "Значение не заполнено"}>{value || "—"}</span>; }
function TaskRow({ row }: { row: DashboardRow }) { return <tr><td>{row.__ticketValid ? <a className="ticketLink" href={row.__ticket} target="_blank" rel="noreferrer">Открыть тикет</a> : <span className="invalidValue">{row.__ticket || "Нет ссылки"}</span>}</td><td>{row.__title}</td><td>{row.__customer}</td><td>{row.__analyst}</td><td>{row.__area}</td><td><ScoreBadge value={row.__value}/></td><td><ScoreBadge value={row.__analysisTime}/></td><td><span className="statusBadge">{row.__status}</span></td><td>{row.__note || "—"}</td></tr>; }
