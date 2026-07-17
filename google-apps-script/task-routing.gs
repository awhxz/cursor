/**
 * Валидация и перемещение задач между листами Google Sheets.
 * Столбцы определяются по заголовкам, поэтому скрипт не зависит от старых номеров столбцов.
 */

const HEADER_ROW = 1;
const MANAGED_SHEETS = ["Актуальные", "Готовые задачи", "Общий бэклог"];
const SCORE_VALUES = ["1", "2", "3", "4"];

const FIELD_ALIASES = {
  ticket: ["тикет", "ссылка на тикет"],
  title: ["название", "название задачи"],
  customer: ["заказчик", "заказчики"],
  analyst: ["ответственный", "ответственные", "аналитик"],
  area: ["к чему относится", "раздел", "направление"],
  value: ["ценность", "ценности"],
  analysisTime: ["сколько времени в аналитике", "время в аналитике"],
  status: ["статус"],
  comment: ["комментарий", "комментарии"]
};

const REQUIRED_ON_STATUS_CHANGE = ["ticket", "title", "customer", "analyst", "area", "value", "analysisTime"];

const STATUS_TO_SHEET = {
  "В работе": "Актуальные",
  "В очереди": "Актуальные",
  "Ждет ответа от руководства": "Актуальные",
  "Не согласовано": "Актуальные",
  "Хот": "Актуальные",
  "Готово": "Готовые задачи",
  "Стоп": "Готовые задачи",
  "Бэклог 2025": "Общий бэклог",
  "Бэклог 2026": "Общий бэклог"
};

function normalizeHeader_(value) {
  return String(value || "").trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

function getColumnMap_(sheet) {
  const headers = sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const normalized = headers.map(normalizeHeader_);
  const result = {};
  Object.keys(FIELD_ALIASES).forEach(function(field) {
    const aliases = FIELD_ALIASES[field].map(normalizeHeader_);
    const index = normalized.findIndex(function(header) { return aliases.indexOf(header) !== -1; });
    if (index !== -1) result[field] = index + 1;
  });
  return result;
}

function assertRequiredColumns_(columns, sheetName) {
  const required = REQUIRED_ON_STATUS_CHANGE.concat(["status"]);
  const missing = required.filter(function(field) { return !columns[field]; });
  if (missing.length) throw new Error('На листе "' + sheetName + '" не найдены столбцы: ' + missing.join(", "));
}

function isHttpUrl_(value) {
  return /^https?:\/\/\S+$/i.test(String(value || "").trim());
}

function validateTaskRow_(sheet, row, columns) {
  const missing = REQUIRED_ON_STATUS_CHANGE.filter(function(field) {
    return !String(sheet.getRange(row, columns[field]).getDisplayValue()).trim();
  });
  const ticket = sheet.getRange(row, columns.ticket).getDisplayValue();
  if (missing.length) return { valid: false, message: "Заполните: " + missing.map(function(field) { return FIELD_ALIASES[field][0]; }).join(", ") };
  if (!isHttpUrl_(ticket)) return { valid: false, message: "Тикет должен быть ссылкой, начинающейся с http:// или https://" };
  return { valid: true, message: "" };
}

function restoreEditedValue_(event, cell) {
  if (event.range.getNumRows() === 1 && event.range.getNumColumns() === 1 && typeof event.oldValue !== "undefined") cell.setValue(event.oldValue);
  else cell.clearContent();
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (MANAGED_SHEETS.indexOf(sheet.getName()) === -1 || e.range.getLastRow() <= HEADER_ROW) return;

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) return;
  try {
    const columns = getColumnMap_(sheet);
    assertRequiredColumns_(columns, sheet.getName());
    const firstRow = Math.max(e.range.getRow(), HEADER_ROW + 1);
    const lastRow = e.range.getLastRow();
    const editedFirstColumn = e.range.getColumn();
    const editedLastColumn = e.range.getLastColumn();

    for (let row = lastRow; row >= firstRow; row--) {
      if (columns.ticket >= editedFirstColumn && columns.ticket <= editedLastColumn) {
        const ticketCell = sheet.getRange(row, columns.ticket);
        const ticket = ticketCell.getDisplayValue();
        if (ticket && !isHttpUrl_(ticket)) {
          restoreEditedValue_(e, ticketCell);
          e.source.toast("Тикет должен начинаться с http:// или https://", "Неверная ссылка", 6);
          continue;
        }
      }

      if (columns.status < editedFirstColumn || columns.status > editedLastColumn) continue;
      const statusCell = sheet.getRange(row, columns.status);
      const status = String(statusCell.getDisplayValue()).trim();
      if (!status) continue;
      const targetSheetName = STATUS_TO_SHEET[status];
      if (!targetSheetName) {
        restoreEditedValue_(e, statusCell);
        e.source.toast('Статус "' + status + '" не поддерживается', "Неверный статус", 6);
        continue;
      }
      const validation = validateTaskRow_(sheet, row, columns);
      if (!validation.valid) {
        restoreEditedValue_(e, statusCell);
        e.source.toast(validation.message, "Задача не перемещена", 8);
        continue;
      }
      if (sheet.getName() !== targetSheetName) moveRowToSheet_(sheet, row, targetSheetName);
    }
  } catch (error) {
    Logger.log("Ошибка onEdit: " + error.stack);
    e.source.toast(error.message, "Ошибка скрипта", 8);
  } finally {
    lock.releaseLock();
  }
}

function moveRowToSheet_(sourceSheet, rowNumber, targetSheetName) {
  const spreadsheet = sourceSheet.getParent();
  const targetSheet = spreadsheet.getSheetByName(targetSheetName);
  if (!targetSheet) throw new Error('Лист "' + targetSheetName + '" не найден');

  const lastColumn = sourceSheet.getLastColumn();
  if (targetSheet.getMaxColumns() < lastColumn) targetSheet.insertColumnsAfter(targetSheet.getMaxColumns(), lastColumn - targetSheet.getMaxColumns());
  const targetRow = Math.max(targetSheet.getLastRow() + 1, HEADER_ROW + 1);
  const sourceRange = sourceSheet.getRange(rowNumber, 1, 1, lastColumn);
  sourceRange.copyTo(targetSheet.getRange(targetRow, 1, 1, lastColumn));
  sourceSheet.deleteRow(rowNumber);
  spreadsheet.toast('Задача перемещена на лист "' + targetSheetName + '"', "Готово", 3);
}

function reorganizeAllTasks() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  if (ui.alert("Реорганизация", "Проверить все задачи и переместить их по статусам?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  let moved = 0;
  let skipped = 0;
  MANAGED_SHEETS.forEach(function(sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    const columns = getColumnMap_(sheet);
    assertRequiredColumns_(columns, sheetName);
    for (let row = sheet.getLastRow(); row > HEADER_ROW; row--) {
      const status = String(sheet.getRange(row, columns.status).getDisplayValue()).trim();
      const target = STATUS_TO_SHEET[status];
      if (!target || target === sheetName) continue;
      const validation = validateTaskRow_(sheet, row, columns);
      if (!validation.valid) { skipped++; continue; }
      moveRowToSheet_(sheet, row, target);
      moved++;
      if (moved % 10 === 0) Utilities.sleep(100);
    }
  });
  ui.alert("Реорганизация завершена", "Перемещено: " + moved + "\nПропущено из-за ошибок: " + skipped, ui.ButtonSet.OK);
}

function setupValidations() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  MANAGED_SHEETS.forEach(function(sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    const columns = getColumnMap_(sheet);
    assertRequiredColumns_(columns, sheetName);
    const rowCount = Math.max(sheet.getMaxRows() - HEADER_ROW, 1);
    const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(STATUS_TO_SHEET), true).setAllowInvalid(false).setHelpText("Выберите статус из списка").build();
    const scoreRule = SpreadsheetApp.newDataValidation().requireValueInList(SCORE_VALUES, true).setAllowInvalid(false).setHelpText("Разрешены значения 1, 2, 3, 4").build();
    const ticketColumnLetter = columnToLetter_(columns.ticket);
    const ticketRule = SpreadsheetApp.newDataValidation().requireFormulaSatisfied('=OR(' + ticketColumnLetter + (HEADER_ROW + 1) + '="",REGEXMATCH(' + ticketColumnLetter + (HEADER_ROW + 1) + ',"^https?://"))').setAllowInvalid(false).setHelpText("Ссылка должна начинаться с http:// или https://").build();
    sheet.getRange(HEADER_ROW + 1, columns.status, rowCount, 1).setDataValidation(statusRule);
    sheet.getRange(HEADER_ROW + 1, columns.value, rowCount, 1).setDataValidation(scoreRule);
    sheet.getRange(HEADER_ROW + 1, columns.analysisTime, rowCount, 1).setDataValidation(scoreRule);
    sheet.getRange(HEADER_ROW + 1, columns.ticket, rowCount, 1).setDataValidation(ticketRule);
  });
  spreadsheet.toast("Валидация настроена на всех найденных листах", "Готово", 5);
}

function columnToLetter_(column) {
  let result = "";
  while (column > 0) {
    const remainder = (column - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    column = Math.floor((column - 1) / 26);
  }
  return result;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("📋 Управление задачами")
    .addItem("⚙️ Настроить валидацию", "setupValidations")
    .addItem("🔄 Реорганизовать все задачи", "reorganizeAllTasks")
    .addToUi();
}
