# Modexa

**Modexa** — единая платформа для управления Telegram- и Discord-сообществами.

## Возможности

- Единая система пользователей и внешних идентификаторов.
- Сообщества, участники и роли.
- Telegram- и Discord-адаптеры.
- Модерация и сохранение moderation cases в SQLite.
- Telegram ↔ Discord Bridge.
- Интерактивные команды и меню.
- Настройки команд для каждого сообщества.
- Audit log.
- Billing foundation.
- Automation engine и AutoMod foundation.
- HTTP API и веб-панель Dashboard.
- Discord OAuth2 для входа в Dashboard.
- Управление Runner из Dashboard/API.
- SQLite backup snapshot API.
- Docker / docker-compose baseline.

## Требования

- Windows 10/11, Linux или macOS
- Node.js 24+
- pnpm 12+
- Git

Проверка версий:

~~~powershell
node --version
pnpm --version
git --version
~~~

## Установка

~~~powershell
git clone https://github.com/Artem4ik493/Modexa.git
cd Modexa
pnpm install
~~~

## Настройка .env

Создайте .env на основе .env.example:

~~~powershell
Copy-Item .env.example .env
~~~

Минимальный набор:

~~~env
TELEGRAM_BOT_TOKEN=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=

MODEXA_DATABASE_PATH=data/modexa.sqlite
MODEXA_API_KEY=change-me

PORT=3000
HOST=0.0.0.0

MODEXA_OWNER_EXTERNAL_IDS=

DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_PERMISSIONS=

DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
MODEXA_DASHBOARD_URL=http://localhost:3000/
~~~

### Telegram

TELEGRAM_BOT_TOKEN — токен Telegram-бота.

### Discord Bot

DISCORD_BOT_TOKEN — токен Discord-бота.

### Discord OAuth2

Для входа в Dashboard через Discord необходимо заполнить:

~~~env
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
~~~

В Discord Developer Portal Redirect URL должен точно совпадать с:

~~~text
http://localhost:3000/auth/discord/callback
~~~

OAuth использует scopes identify и guilds.

После авторизации Dashboard получает информацию о пользователе и доступных ему Discord-серверах.

**DISCORD_CLIENT_SECRET нельзя публиковать, коммитить в Git или отправлять в чат.**

### Владелец Modexa

MODEXA_OWNER_EXTERNAL_IDS — внешние ID владельцев через запятую:

~~~env
MODEXA_OWNER_EXTERNAL_IDS=123456789,987654321
~~~

### API key

MODEXA_API_KEY используется для доступа к API без Discord OAuth:

~~~env
MODEXA_API_KEY=сложный-секретный-ключ
~~~

Для реального сервера обязательно замените change-me.

## Запуск разработки

Основной вариант:

~~~powershell
pnpm dev
~~~

Команда собирает Core, запускает API и Dashboard, а API автоматически запускает Runner.

Dashboard:

~~~text
http://localhost:3000/
~~~

Health:

~~~text
http://localhost:3000/health
~~~

## Проверка проекта

Полная проверка:

~~~powershell
pnpm verify
~~~

Отдельно тесты:

~~~powershell
pnpm test
~~~

Сборка:

~~~powershell
pnpm build
~~~

## Сборка отдельных частей

Core:

~~~powershell
pnpm build:core
~~~

API:

~~~powershell
pnpm build:api
~~~

Запуск API отдельно:

~~~powershell
pnpm --filter @modexa/api dev
~~~

## API

### Health

~~~text
GET /health
~~~

Пример:

~~~powershell
Invoke-WebRequest http://localhost:3000/health
~~~

### Конфигурация

~~~text
GET /api/config
~~~

Показывает состояние Discord OAuth, Dashboard и Runner.

### Discord OAuth

Начало авторизации:

~~~text
GET /auth/discord
~~~

Callback:

~~~text
GET /auth/discord/callback
~~~

Текущая OAuth-сессия:

~~~text
GET /api/auth/discord
~~~

Выход:

~~~text
DELETE /api/auth/discord
~~~

Список доступных Discord-серверов:

~~~text
GET /api/auth/discord/guilds
~~~

Ссылка на добавление бота:

~~~text
GET /api/auth/discord/invite
~~~

Можно передать communityId для конкретного сообщества.

### Авторизация API

Bearer:

~~~http
Authorization: Bearer YOUR_MODEXA_API_KEY
~~~

Или выполнить:

~~~http
POST /api/auth
Content-Type: application/json

{"key":"YOUR_MODEXA_API_KEY"}
~~~

После этого API выдаёт cookie-сессию.

## Runner API

Статус:

~~~text
GET /api/runtime
~~~

Запуск:

~~~http
POST /api/runtime
Content-Type: application/json

{"action":"start"}
~~~

Перезапуск:

~~~http
POST /api/runtime
Content-Type: application/json

{"action":"restart"}
~~~

Остановка:

~~~http
POST /api/runtime
Content-Type: application/json

{"action":"stop"}
~~~

Dashboard использует эти endpoints для управления Runner.

## Управление сообществом

Переключение режима:

~~~http
POST /api/community/mode
Content-Type: application/json

{
  "communityId": "community-id",
  "mode": "public"
}
~~~

Допустимые значения: public и private.

## Dashboard

Dashboard доступен по адресу:

~~~text
http://localhost:3000/
~~~

Через него доступны:

- Discord OAuth;
- Discord-серверы пользователя;
- состояние Runner;
- запуск, остановка и перезапуск Runner;
- состояние Telegram/Discord адаптеров;
- сообщества;
- настройки команд;
- модерация;
- audit log;
- bridge;
- automation;
- billing;
- backup snapshot.

### Привязка и отвязка Telegram-группы

1. Добавьте Telegram-бота Modexa в нужную группу и назначьте его администратором.
2. Пользователь, который создаёт привязку, тоже должен быть администратором группы.
3. В Telegram-группе выполните команду:

   ```text
   /dashboard_link
   ```

Чтобы отвязать Telegram-группу без Dashboard, администратор этой группы может выполнить:

   ```text
   /dashboard_unlink
   ```

Команда удаляет привязку этой группы ко всем сообществам Modexa, очищает связанные с ней Bridge endpoints и отменяет ожидающие запросы привязки. Повторно подключить группу можно командой `/dashboard_link`.

4. Бот выдаст одноразовый код из 16 шестнадцатеричных символов. Код действует 10 минут.
5. Откройте Dashboard и войдите через Discord.
6. В разделе **Discord-сервера** выберите Discord-сообщество, где установлен бот Modexa.
7. В карточке **Подключить Telegram-группу** вставьте код и нажмите **Привязать группу**.

Чтобы отвязать группу, откройте в том же разделе карточку **Подключить Telegram-группу**. Ниже формы появится список **Привязанные Telegram-группы**. Нажмите **Отвязать** рядом с нужной группой и подтвердите действие.

Отвязка удаляет связь Telegram-группы с выбранным сообществом и относящийся к ней Bridge endpoint, если он был создан для этой группы. Команды `/link` или `/unlink` для этой операции не предусмотрены: привязка начинается командой `/dashboard_link`, а подтверждение и отвязка выполняются в Dashboard.

Если при привязке сообщается, что группа уже привязана, проверьте список привязанных групп в сообществе, к которому она подключена, и отвяжите её там перед повторной привязкой.

## Как проверить API вручную

После pnpm dev:

1. Откройте http://localhost:3000/health.
2. Откройте http://localhost:3000/api/config.
3. Откройте http://localhost:3000/api/runtime.
4. Откройте http://localhost:3000/.
5. Для проверки OAuth откройте http://localhost:3000/auth/discord.

Если OAuth настроен правильно, откроется авторизация Discord.

## Как остановить Modexa

Если запущен pnpm dev, нажмите:

~~~text
Ctrl + C
~~~

API обрабатывает SIGINT/SIGTERM и закрывает базу данных.

### Если Node.js остался висеть в Windows

Посмотреть процессы:

~~~powershell
Get-Process node
~~~

Завершить все процессы Node.js:

~~~powershell
taskkill /F /IM node.exe
~~~

Или:

~~~powershell
Stop-Process -Name node -Force
~~~

### Найти процесс на порту 3000

~~~powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
~~~

Подробно:

~~~powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object LocalAddress,LocalPort,State,OwningProcess
~~~

Завершить конкретный PID:

~~~powershell
Stop-Process -Id <PID> -Force
~~~

## SQLite

По умолчанию база:

~~~text
data/modexa.sqlite
~~~

Путь можно изменить через MODEXA_DATABASE_PATH.

Не рекомендуется коммитить рабочую SQLite-базу с пользовательскими данными.

## Backup

Snapshot базы:

~~~text
GET /api/backup
~~~

Endpoint требует авторизацию.

## Docker

Локальный тестовый запуск:

~~~bash
docker-compose up --build -d
docker-compose ps
docker-compose logs -f modexa
~~~

Остановка без удаления данных:

~~~bash
docker-compose down
~~~

Полная инструкция для тестового сервера Ubuntu 22.04, Docker Compose v1 и aaPanel:
[docs/DEPLOY_UBUNTU_22_04.md](docs/DEPLOY_UBUNTU_22_04.md).

Для схемы с немецкой Docker-нодой и российским aaPanel контейнер публикует порт 3000 на сетевых интерфейсах немецкой ноды. Входящий TCP/3000 на немецкой ноде обязательно ограничьте firewall: разрешите только публичный IP российского сервера с aaPanel. DNS домена Dashboard/API должен указывать на российский сервер, а aaPanel проксирует запросы на немецкую ноду. Не открывайте порт 3000 всему интернету.

## Типичный цикл разработки

После получения изменений:

~~~powershell
git pull
pnpm install
pnpm verify
pnpm dev
~~~

После изменений:

~~~powershell
pnpm verify
~~~

После успешной проверки:

~~~powershell
git status
git add .
git commit -m "описание изменений"
git push
~~~

## Структура проекта

~~~text
apps/
  api/          HTTP API
  dashboard/    веб-панель
  discord/      Discord adapter
  runner/       Runtime / Runner
  telegram/     Telegram adapter

packages/
  core/         основная бизнес-логика

scripts/
  dev.mjs       dev launcher

data/
  modexa.sqlite SQLite database
~~~

## Безопасность

- Не коммитьте .env.
- Не публикуйте DISCORD_BOT_TOKEN.
- Не публикуйте TELEGRAM_BOT_TOKEN.
- Не публикуйте DISCORD_CLIENT_SECRET.
- Не публикуйте MODEXA_API_KEY.
- Не запускайте production с MODEXA_API_KEY=change-me.
- Перед отправкой изменений запускайте pnpm verify.

## Статус проекта

Modexa находится в активной разработке.

Текущая платформа включает Core, Telegram, Discord, Runner, API и Dashboard. Дальнейшая разработка направлена на полноценное управление сообществами и серверами через веб-панель.
