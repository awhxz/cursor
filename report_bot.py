from __future__ import annotations

import logging
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import time
from typing import Any

import yaml
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]


@dataclass(frozen=True)
class ReportConfig:
    spreadsheet_id: str
    columns: dict[str, list[str]]
    analysts: list[str]
    sections: dict[str, dict[str, Any]]


def load_config(path: str) -> ReportConfig:
    with open(path, "r", encoding="utf-8") as file:
        raw = yaml.safe_load(file)
    return ReportConfig(
        spreadsheet_id=os.getenv("GOOGLE_SPREADSHEET_ID") or raw["spreadsheet_id"],
        columns=raw.get("columns", {}),
        analysts=raw.get("analysts", []),
        sections=raw.get("sections", {}),
    )


class SheetsClient:
    def __init__(self, service_account_file: str):
        credentials = Credentials.from_service_account_file(service_account_file, scopes=SCOPES)
        self.service = build("sheets", "v4", credentials=credentials, cache_discovery=False)

    def rows(self, spreadsheet_id: str, sheet_name: str) -> list[dict[str, str]]:
        result = (
            self.service.spreadsheets()
            .values()
            .get(spreadsheetId=spreadsheet_id, range=f"'{sheet_name}'")
            .execute()
        )
        values = result.get("values", [])
        if not values:
            return []
        headers = [normalize_header(value) for value in values[0]]
        rows: list[dict[str, str]] = []
        for raw_row in values[1:]:
            row = {headers[index]: str(value).strip() for index, value in enumerate(raw_row) if index < len(headers)}
            if any(row.values()):
                rows.append(row)
        return rows


def normalize_header(value: Any) -> str:
    return str(value).strip().lower().replace("ё", "е")


def value(row: dict[str, str], aliases: list[str]) -> str:
    for alias in aliases:
        normalized = normalize_header(alias)
        if row.get(normalized):
            return row[normalized]
    return ""


def matches(row: dict[str, str], cfg: ReportConfig, filters: list[str]) -> bool:
    if not filters:
        return True
    haystack = " ".join(row.values()).lower().replace("ё", "е")
    return any(item.lower().replace("ё", "е") in haystack for item in filters)


def format_task(row: dict[str, str], cfg: ReportConfig) -> str:
    ticket = value(row, cfg.columns.get("ticket", []))
    title = value(row, cfg.columns.get("title", []))
    note = value(row, cfg.columns.get("note", []))
    text = "\t".join(part for part in [ticket, title] if part)
    if note:
        text = f"{text}. {note}" if text else note
    return text or " ".join(row.values())


def render_numbered(rows: list[dict[str, str]], cfg: ReportConfig) -> list[str]:
    return [f"{index}. {format_task(row, cfg)}" for index, row in enumerate(rows, start=1)]


def build_report(cfg: ReportConfig, sheets: SheetsClient) -> str:
    lines = [
        "3 этапа планирования. Таблички",
        "5 этапа: Аналитика -> Разработка в спринте -> Тестирование в релизе (+Хоты и баги)",
        "",
        "Задачи у аналитиков: Актуальные задачи аналитики + бэклог",
        "Что мы хотим взять в спринт и релиз: Отчет спринт",
        "Что в итоге взяли в релиз: Релизы",
    ]

    cache: dict[str, list[dict[str, str]]] = {}
    for section in cfg.sections.values():
        sheet_name = section["sheet"]
        cache.setdefault(sheet_name, sheets.rows(cfg.spreadsheet_id, sheet_name))
        rows = [row for row in cache[sheet_name] if matches(row, cfg, section.get("status_contains", []))]
        lines.extend(["", section["title"]])
        if section.get("group_by") == "analyst":
            grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
            for row in rows:
                grouped[value(row, cfg.columns.get("analyst", [])) or "Без ответственного"].append(row)
            for analyst in cfg.analysts or sorted(grouped):
                analyst_rows = grouped.get(analyst, [])
                if analyst_rows:
                    lines.extend([analyst, *render_numbered(analyst_rows, cfg), ""])
        else:
            lines.extend(render_numbered(rows, cfg) or ["—"])
    return "\n".join(lines).strip()


def telegram_chunks(text: str, limit: int = 4096) -> list[str]:
    chunks: list[str] = []
    current = ""
    for line in text.splitlines():
        candidate = f"{current}\n{line}" if current else line
        if len(candidate) > limit:
            if current:
                chunks.append(current)
            current = line
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks or ["—"]


def allowed_chat_ids() -> set[int]:
    raw = os.getenv("TELEGRAM_ALLOWED_CHAT_IDS", "")
    return {int(item.strip()) for item in raw.split(",") if item.strip()}


async def chat_id(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_chat is None:
        return
    await update.effective_chat.send_message(f"Chat ID: {update.effective_chat.id}")


async def report(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_chat is None or update.effective_chat.id not in allowed_chat_ids():
        return
    text = build_report(context.application.bot_data["config"], context.application.bot_data["sheets"])
    for chunk in telegram_chunks(text):
        await update.effective_chat.send_message(chunk)


async def scheduled_report(context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = int(os.getenv("TELEGRAM_REPORT_CHAT_ID") or next(iter(allowed_chat_ids())))
    text = build_report(context.application.bot_data["config"], context.application.bot_data["sheets"])
    for chunk in telegram_chunks(text):
        await context.bot.send_message(chat_id=chat_id, text=chunk)


def main() -> None:
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    config = load_config(os.getenv("REPORT_CONFIG", "./config.example.yml"))
    sheets = SheetsClient(os.environ["GOOGLE_SERVICE_ACCOUNT_FILE"])
    app = Application.builder().token(os.environ["TELEGRAM_BOT_TOKEN"]).build()
    app.bot_data["config"] = config
    app.bot_data["sheets"] = sheets
    app.add_handler(CommandHandler("chat_id", chat_id))
    app.add_handler(CommandHandler("report", report))
    hour, minute = [int(part) for part in os.getenv("REPORT_TIME_UTC", "06:00").split(":", maxsplit=1)]
    app.job_queue.run_daily(scheduled_report, time=time(hour=hour, minute=minute))
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
