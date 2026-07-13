"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardPayload, DashboardRow } from "@/lib/dashboard-data";
import { buildKpi, groupCount } from "@/lib/dashboard-data";

const COLORS = ["#315c7f", "#6f91a9", "#97b6a4", "#d4a373", "#c77d7d", "#8f88a8"];
const emptyPayload: DashboardPayload = {
  rows: [],
  columns: [],
  fetchedAt: "",
  source: "public-csv",
  spreadsheetId: "",
  sheetGid: "",
  sourceUrl: "",
  availableSheets: [],
};

export default function DashboardPage() {
  const [payload, setPayload] = useState<DashboardPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyst, setAnalyst] = useState("Все");
  const [status, setStatus] = useState("Все");
  const [query, setQuery] = useState("");
  const [selectedGid, setSelectedGid] = useState("");

  async function loadData() {
    setLoading(true); setError("");
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
    } finally { setLoading(false); }
  }

  useEffect(() => { loadData(); const id = setInterval(loadData, 5 * 60 * 1000); return () => clearInterval(id); }, [selectedGid]);

  const analysts = useMemo(() => ["Все", ...Array.from(new Set(payload.rows.map((row) => row.__analyst))).sort()], [payload.rows]);
  const statuses = useMemo(() => ["Все", ...Array.from(new Set(payload.rows.map((row) => row.__status))).sort()], [payload.rows]);
  const filtered = useMemo(() => payload.rows.filter((row) => {
    const matchesAnalyst = analyst === "Все" || row.__analyst === analyst;
    const matchesStatus = status === "Все" || row.__status === status;
    const haystack = Object.values(row).join(" ").toLowerCase();
    return matchesAnalyst && matchesStatus && haystack.includes(query.toLowerCase());
  }), [payload.rows, analyst, status, query]);
  const kpi = buildKpi(filtered);
  const byAnalyst = groupCount(filtered, "__analyst").slice(0, 8);
  const byStatus = groupCount(filtered, "__status").slice(0, 8);
  const resetFilters = () => { setAnalyst("Все"); setStatus("Все"); setQuery(""); };
  const sheetName = payload.sheetTitle || (payload.sheetGid ? `gid ${payload.sheetGid}` : "лист не выбран");

  return <main className="shell">
    <section className="hero">
      <div><p className="eyebrow">Google Sheets → веб-дашборд</p><h1>Дашборд руководителя</h1><p className="muted">Актуальная сводка по задачам без ручной выгрузки Excel.</p>{payload.sourceUrl && <p className="source">Источник данных: <a href={payload.sourceUrl} target="_blank" rel="noreferrer">Открыть Google Sheets</a><span>{sheetName}</span></p>}</div>
      <div className="refresh"><button onClick={loadData} disabled={loading}>{loading ? "Обновляем…" : "Обновить данные"}</button><span>{payload.fetchedAt ? `Последнее обновление: ${new Date(payload.fetchedAt).toLocaleString("ru-RU")}` : "Данные еще не загружены"}</span></div>
    </section>

    {error && <section className="state error"><b>Не удалось загрузить данные.</b><span>{error}</span><button onClick={loadData}>Повторить загрузку</button></section>}
    {loading && <section className="state">Загружаем актуальные данные из Google Sheets…</section>}

    <section className="filters">
      {payload.availableSheets.length > 0 && <label>Лист Google Sheets<select value={selectedGid || payload.sheetGid} onChange={(e) => { setSelectedGid(e.target.value); resetFilters(); }}>{payload.availableSheets.map((sheet) => <option key={sheet.gid} value={sheet.gid}>{sheet.title}</option>)}</select></label>}
      <label>Ответственный<select value={analyst} onChange={(e) => setAnalyst(e.target.value)}>{analysts.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Статус<select value={status} onChange={(e) => setStatus(e.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Поиск<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Тикет, тема, комментарий" /></label>
      <button className="secondary" onClick={resetFilters}>Сбросить фильтры</button>
    </section>

    {!loading && !error && !payload.rows.length && <section className="state">В таблице нет строк для отображения.</section>}

    <section className="kpis">
      <Kpi title="Всего задач" value={kpi.total} /> <Kpi title="Ответственных" value={kpi.analysts} /> <Kpi title="Статусов" value={kpi.statuses} /> <Kpi title="Без ответственного" value={kpi.withoutOwner} /> <Kpi title="Некорректные даты" value={kpi.invalidDates} />
    </section>

    <section className="grid">
      <ChartCard title="Распределение по ответственным"><ResponsiveContainer width="100%" height={280}><BarChart data={byAnalyst}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="value" fill="#315c7f" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Распределение по статусам"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={byStatus} dataKey="value" nameKey="name" outerRadius={100} label>{byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
    </section>

    <section className="tableCard"><div className="tableHead"><h2>Детализация</h2><span>Показано строк: {filtered.length}</span></div><div className="tableWrap"><table><thead><tr><th>Тикет</th><th>Название</th><th>Ответственный</th><th>Статус</th><th>Приоритет</th><th>Дата</th><th>Комментарий</th></tr></thead><tbody>{filtered.map((row) => <Row key={row.__id} row={row}/>)}</tbody></table></div></section>
  </main>;
}
function Kpi({ title, value }: { title: string; value: number }) { return <article className="kpi"><span>{title}</span><strong>{value}</strong></article>; }
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) { return <article className="card"><h2>{title}</h2>{children}</article>; }
function Row({ row }: { row: DashboardRow }) { return <tr><td>{row.__ticket || "—"}</td><td>{row.__title}</td><td>{row.__analyst}</td><td>{row.__status}</td><td>{row.__priority}</td><td className={row.__date && !row.__dateValid ? "bad" : ""}>{row.__date || "—"}</td><td>{row.__note || "—"}</td></tr>; }
