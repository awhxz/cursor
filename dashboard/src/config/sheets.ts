export const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || "1HB29ZDJvyPuyfG5z4MguTEhJ4_OngRqDVRxKfqV9rWQ";
export const analyticsSheetGid = "1654701914";
export const defaultSheetGid = process.env.GOOGLE_SHEET_GID || analyticsSheetGid;
export const dashboardColumnLimit = 9;

export function buildSheetUrl(gid: string = defaultSheetGid) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=${gid}`;
}

export const columnAliases = {
  analyst: ["ответственный", "ответственные", "аналитик", "исполнитель", "assignee"],
  ticket: ["тикет", "ссылка на тикет", "задача", "key", "jira", "номер"],
  title: ["название", "название задачи", "описание", "тема", "summary"],
  customer: ["заказчик", "заказчики", "клиент", "инициатор"],
  area: ["к чему относится", "раздел", "направление", "продукт"],
  value: ["ценность", "ценности", "ценность 3", "ценность три", "value"],
  analysisTime: ["сколько времени в аналитике", "время в аналитике", "срок в аналитике"],
  status: ["статус", "состояние", "этап"],
  note: ["комментарий", "комментарии", "примечание", "note"],
} as const;

// TODO: подтвердить с владельцем таблицы финальную бизнес-классификацию статусов.
// Сейчас дашборд строит KPI только из фактических столбцов и использует эти алиасы как мягкое сопоставление.
export const allowedStatuses = [
  "В работе",
  "В очереди",
  "Бэклог 2025",
  "Ждет ответа от руководства",
  "Не согласовано",
  "Хот",
  "Готово",
  "Стоп",
  "Бэклог 2026",
] as const;
