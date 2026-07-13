# Telegram report bot MVP

MVP собирает текстовый отчет из Google Sheets и отправляет его в Telegram по команде `/report` или ежедневно по расписанию.

## Что нужно прописать, чтобы бот работал

1. Создать Telegram-бота через `@BotFather` и положить токен в `TELEGRAM_BOT_TOKEN`.
2. Узнать свой Telegram chat ID: временно запустить бота, написать ему `/chat_id` и скопировать число из ответа в `TELEGRAM_ALLOWED_CHAT_IDS`.
3. Создать Google Cloud service account, скачать JSON-ключ и указать путь в `GOOGLE_SERVICE_ACCOUNT_FILE`.
4. Открыть таблицу Google Sheets и дать service account доступ на чтение по email из JSON-ключа.
5. Указать ID таблицы в `GOOGLE_SPREADSHEET_ID`. Для вашей ссылки это `1HB29ZDJvyPuyfG5z4MguTEhJ4_OngRqDVRxKfqV9rWQ`.
6. Настроить `config.example.yml`: названия листов, колонки, аналитиков и фильтры для разделов отчета.



## Подробная настройка Google Sheets для новичка

### 1. Что такое service account

Service account — это отдельный технический Google-пользователь для программы. Бот будет заходить в таблицу не под вашим личным аккаунтом, а под этим техническим пользователем. У него есть email вида:

```text
report-bot@your-project-id.iam.gserviceaccount.com
```

Именно этот email нужно будет добавить в доступы Google Sheets как обычного читателя.

### 2. Создать проект в Google Cloud

1. Откройте [Google Cloud Console](https://console.cloud.google.com/).
2. В верхней панели нажмите на выбор проекта.
3. Нажмите **New project / Новый проект**.
4. Назовите проект, например `sheets-report-bot`.
5. Нажмите **Create / Создать**.
6. Убедитесь, что в верхней панели выбран именно этот проект.

### 3. Включить Google Sheets API

1. В Google Cloud Console откройте **APIs & Services → Library**.
2. В поиске введите `Google Sheets API`.
3. Откройте найденный API.
4. Нажмите **Enable / Включить**.

Без этого шага бот не сможет читать таблицу через Google API.

### 4. Создать service account

1. В Google Cloud Console откройте **IAM & Admin → Service Accounts**.
2. Нажмите **Create service account / Создать сервисный аккаунт**.
3. В поле имени напишите, например `sheets-report-bot`.
4. Нажмите **Create and continue**.
5. Роли можно не добавлять, потому что доступ к конкретной таблице мы дадим через кнопку **Share** в Google Sheets.
6. Нажмите **Done**.

### 5. Скачать JSON-ключ

1. На странице **Service Accounts** нажмите на созданный service account.
2. Откройте вкладку **Keys / Ключи**.
3. Нажмите **Add key → Create new key**.
4. Выберите тип **JSON**.
5. Нажмите **Create**.
6. Браузер скачает файл `.json`.
7. Переименуйте его, например, в `service-account.json`.
8. Положите файл рядом с `report_bot.py`.
9. В `.env` укажите путь:

```env
GOOGLE_SERVICE_ACCOUNT_FILE=./service-account.json
```

Никогда не отправляйте этот JSON-ключ в чат и не коммитьте его в git: это пароль бота к Google API.

### 6. Найти email service account в JSON

Откройте скачанный JSON-файл любым текстовым редактором и найдите поле `client_email`. Оно выглядит примерно так:

```json
"client_email": "sheets-report-bot@your-project-id.iam.gserviceaccount.com"
```

Скопируйте этот email целиком.

### 7. Дать service account доступ к Google Sheets

1. Откройте вашу Google-таблицу.
2. Нажмите **Share / Поделиться** в правом верхнем углу.
3. Вставьте email из поля `client_email`.
4. Выберите роль **Viewer / Читатель**.
5. Нажмите **Send / Отправить** или **Share / Поделиться**.

После этого бот сможет читать таблицу. Доступ **Editor / Редактор** не нужен, потому что MVP только читает данные.

### 8. Указать ID таблицы

ID таблицы — это часть ссылки между `/d/` и `/edit`.

Ваша ссылка:

```text
https://docs.google.com/spreadsheets/d/1HB29ZDJvyPuyfG5z4MguTEhJ4_OngRqDVRxKfqV9rWQ/edit?gid=1301435451#gid=1301435451
```

ID таблицы:

```text
1HB29ZDJvyPuyfG5z4MguTEhJ4_OngRqDVRxKfqV9rWQ
```

В `.env` должно быть так:

```env
GOOGLE_SPREADSHEET_ID=1HB29ZDJvyPuyfG5z4MguTEhJ4_OngRqDVRxKfqV9rWQ
```

### 9. Настроить `config.example.yml`

В `config.example.yml` нужно описать, как бот должен читать вашу таблицу.

#### `spreadsheet_id`

Это тот же ID Google-таблицы. Его можно оставить в конфиге или переопределить через `.env`.

```yaml
spreadsheet_id: "1HB29ZDJvyPuyfG5z4MguTEhJ4_OngRqDVRxKfqV9rWQ"
```

#### `columns`

Это список возможных названий колонок. Бот читает первую строку листа как заголовки. Если в таблице колонка называется `Ответственный`, `Аналитик` или `Исполнитель`, бот поймет, что это колонка аналитика.

```yaml
columns:
  analyst: ["аналитик", "ответственный", "исполнитель", "assignee"]
  ticket: ["тикет", "задача", "key", "jira", "номер"]
  title: ["название", "описание", "тема", "summary"]
  status: ["статус", "состояние", "этап"]
  note: ["комментарий", "примечание", "note"]
```

Если в вашей таблице колонка называется иначе, просто добавьте это название в нужный список.

#### `analysts`

Это порядок аналитиков в отчете.

```yaml
analysts: ["Аня", "Саша", "Настя", "Таня"]
```

#### `sections`

Это разделы будущего отчета. Каждый раздел говорит боту:

- какой заголовок напечатать;
- из какого листа брать задачи;
- какие слова искать в строках;
- нужно ли группировать задачи по аналитикам.

Пример:

```yaml
focus:
  title: "✅Фокусные задачи в работе на этой неделе"
  sheet: "Отчет спринт"
  status_contains: ["фокус", "в работе", "спринт"]
  group_by: "analyst"
```

Это значит: взять лист `Отчет спринт`, найти строки, где встречается `фокус`, `в работе` или `спринт`, сгруппировать их по аналитику и вывести под заголовком `✅Фокусные задачи в работе на этой неделе`.

Если `status_contains: []`, бот возьмет все непустые строки с листа.

## Быстрый старт

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# заполнить .env и config.example.yml
python report_bot.py
```

## Как бот понимает таблицу

Бот читает первую строку каждого листа как заголовки колонок. Алиасы заголовков задаются в `columns` внутри `config.example.yml`, поэтому можно использовать русские названия вроде `Аналитик`, `Тикет`, `Название`, `Статус`, `Комментарий`.

Каждый раздел отчета задается в `sections`:

- `title` — заголовок в отчете;
- `sheet` — лист Google Sheets;
- `status_contains` — слова, которые бот ищет в строке, чтобы отобрать задачи;
- `group_by: analyst` — группировка задач по аналитикам.

## Команды

- `/chat_id` — показать ID текущего личного чата или группы, чтобы заполнить `TELEGRAM_ALLOWED_CHAT_IDS` и `TELEGRAM_REPORT_CHAT_ID`.
- `/report` — собрать и отправить отчет сейчас.

Кроме команды, бот отправляет отчет каждый день во время из `REPORT_TIME_UTC` в чат `TELEGRAM_REPORT_CHAT_ID`.
