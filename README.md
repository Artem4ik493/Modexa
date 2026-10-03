# Modexa

Unified Telegram + Discord community automation platform.

## Current platform

- Unified identity, communities, memberships and roles.
- Member directory and `/role`.
- Moderation Core + Telegram + Discord actions.
- Persistent moderation cases in SQLite.
- Telegram ↔ Discord bridge with persisted links.
- Billing plans/entitlements foundation.
- Automation engine and AutoMod rule engine.
- Interaction dispatcher with buttons, callbacks and menus.
- SQLite backup snapshot API.
- HTTP API and lightweight dashboard.
- Docker / docker-compose production baseline.

## Development

```powershell
pnpm install
pnpm verify
pnpm dev
```

Copy `.env.example` to `.env` and configure the platform tokens.

## API

```powershell
pnpm build:api
pnpm --filter @modexa/api dev
```

Health: `/health`

Dashboard: open http://localhost:3000/ while the API is running.

`pnpm dev` builds Core and starts the API, Dashboard and Runner together. Runner starts any configured Telegram/Discord adapters from `.env`.

Production-like checks:

```powershell
pnpm build
pnpm test
```

Docker:

```powershell
docker compose up --build -d
```

## Public bot

Modexa is designed as a public bot: communities can connect it to Telegram or Discord and use the command suite without being tied to one private server. Administrators can enable or disable individual commands with `/command <команда> <on|off>` and inspect the current configuration with `/settings`.

Included user-facing features include help/command discovery, bot info, server info, user profiles, usage statistics, warnings, mute lists, moderation, roles, bridge and automation foundations.
