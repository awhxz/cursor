export const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || "1HB29ZDJvyPuyfG5z4MguTEhJ4_OngRqDVRxKfqV9rWQ";
export const sheetGid = process.env.GOOGLE_SHEET_GID || "1200022421";

export const columnAliases = {
  analyst: ["аналитик", "ответственный", "исполнитель", "assignee"],
  ticket: ["тикет", "задача", "key", "jira", "номер"],
  title: ["название", "описание", "тема", "summary"],
  status: ["статус", "состояние", "этап"],
  priority: ["приоритет", "priority"],
  note: ["комментарий", "примечание", "note"],
  date: ["дата", "создано", "обновлено", "deadline", "дедлайн", "срок"],
} as const;

// TODO: подтвердить с владельцем таблицы финальную бизнес-классификацию статусов.
// Сейчас дашборд строит KPI только из фактических столбцов и использует эти алиасы как мягкое сопоставление.
export const plannedAnalysts = ["Аня", "Саша", "Настя", "Таня"];
