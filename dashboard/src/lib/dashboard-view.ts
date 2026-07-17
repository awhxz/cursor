import type { DashboardRow } from "./dashboard-data";

export type DashboardTab = "actual" | "backlog" | "done" | "all";
export type Tone = "red" | "orange" | "yellow" | "green" | "blue" | "peach" | "gray" | "violet";

export const dashboardTabs: Array<{ key: DashboardTab; label: string; sheetTitle?: string }> = [
  { key: "actual", label: "Актуальные", sheetTitle: "Актуальные" },
  { key: "backlog", label: "Бэклог", sheetTitle: "Общий бэклог" },
  { key: "done", label: "Готовые и стоп", sheetTitle: "Готовые задачи" },
  { key: "all", label: "Все" },
];

const normalized = (value: string) => value.trim().toLowerCase().replaceAll("ё", "е");
const isUnassigned = (value: string) => {
  const analyst = normalized(value);
  return !analyst || analyst.includes("без ответственного") || analyst.includes("не назначен");
};

export function rowMatchesTab(row: DashboardRow, tab: DashboardTab) {
  if (tab === "all") return true;
  const status = normalized(row.__status);
  if (tab === "backlog") return status.includes("бэклог") || status.includes("backlog");
  if (tab === "done") return status === "готово" || status === "стоп";
  return !status.includes("бэклог") && !status.includes("backlog") && status !== "готово" && status !== "стоп";
}

export function isQueueTask(row: DashboardRow) {
  const status = normalized(row.__status);
  return status === "в очереди" || (status === "не согласовано" && isUnassigned(row.__analyst));
}

export function analystPresentation(value: string): { label: string; icon: string; tone: Tone; order: number } {
  const name = normalized(value);
  if (name.includes("аня г") || name === "аня") return { label: value, icon: "✦", tone: "yellow", order: 0 };
  if (name.includes("настя п") || name === "настя") return { label: value, icon: "●", tone: "green", order: 1 };
  if (name.includes("саша г") || name === "саша") return { label: value, icon: "◆", tone: "blue", order: 2 };
  if (name.includes("таня к") || name === "таня") return { label: value, icon: "▲", tone: "peach", order: 3 };
  if (isUnassigned(value)) {
    return { label: "Не назначен", icon: "—", tone: "gray", order: 99 };
  }
  return { label: value, icon: "•", tone: "gray", order: 50 };
}

export function statusTone(value: string): Tone {
  const status = normalized(value);
  if (status === "в работе") return "blue";
  if (status === "в очереди") return "violet";
  if (status.includes("бэклог")) return "gray";
  if (status === "готово") return "green";
  if (status === "стоп" || status === "не согласовано") return "red";
  if (status.includes("ждет ответа")) return "yellow";
  if (status === "хот") return "peach";
  return "gray";
}

export function metricPresentation(value: string, label: string): { text: string; tone: Tone; tooltip: string } {
  const text = value.trim();
  if (!text) return { text: "—", tone: "gray", tooltip: `${label}: не указано` };
  if (normalized(text) === "нет решения") return { text, tone: "red", tooltip: `${label}: нет решения` };
  const tones: Record<string, Tone> = { "1": "red", "2": "orange", "3": "yellow", "4": "green" };
  return { text, tone: tones[text] || "red", tooltip: `${label}: ${text}` };
}
