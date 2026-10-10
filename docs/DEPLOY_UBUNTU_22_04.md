# Modexa test deployment — Ubuntu 22.04 + Docker + aaPanel

This guide deploys the API and Dashboard together at **https://api.artem4ik493.ru/**.
The app container binds only to `127.0.0.1:3000`; aaPanel/Nginx terminates HTTPS.
This setup does not modify other websites, does not take over their ports, and does not install a VPN.

## 1. DNS and aaPanel

1. Create an `A` record for `api.artem4ik493.ru` pointing to this server's public IP.
2. In aaPanel, add the website/domain `api.artem4ik493.ru`.
3. Issue and enable a valid HTTPS certificate for that domain.
4. Configure a reverse proxy to `http://127.0.0.1:3000`.
5. Preserve the `Host` header and pass `X-Forwarded-Proto $scheme` and `X-Forwarded-For $proxy_add_x_forwarded_for` to the upstream. The app uses forwarded HTTPS information to set secure login cookies.
6. Allow inbound ports 80 and 443 as required for the existing aaPanel web server. Do not open port 3000 publicly.

Do not change the ports or reverse proxies used by existing websites.

## 2. Get the project

Use the existing server directory if the repository is already checked out there. Otherwise clone the repository into `/opt/modexa` using your authorized GitHub access.

```bash
cd /opt/modexa
git pull
```

This repository is private, so authenticate with GitHub without putting a personal access token into a command or a file committed to the repository.

## 3. Create the environment file and persistent data directory

```bash
cd /opt/modexa
cp .env.example .env
mkdir -p data
chown -R 1000:1000 data
chmod 700 data
chmod 600 .env
nano .env
```

Set at least one bot token. For a combined Telegram + Discord test, configure both:

- `TELEGRAM_BOT_TOKEN`: token from BotFather.
- `DISCORD_BOT_TOKEN`: Discord bot token.
- `MODEXA_API_KEY`: a unique random secret, at least 32 characters. Generate one with `openssl rand -hex 32` and paste the result into `.env`.
- `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`: OAuth2 application credentials from Discord Developer Portal.
- `DISCORD_REDIRECT_URI=https://api.artem4ik493.ru/auth/discord/callback`
- `MODEXA_DASHBOARD_URL=https://api.artem4ik493.ru/`
- `MODEXA_DATABASE_PATH=/app/data/modexa.sqlite`
- `HOST=0.0.0.0` and `PORT=3000`

Keep `MODEXA_ALLOWED_ORIGINS` empty: Dashboard and API are served from the same origin. Do not add a trailing slash to the OAuth callback URL.

Do not paste secrets into chat or commit `.env` to Git.

## 4. Discord Developer Portal

In **OAuth2 → General → Redirects**, add this exact URL and save:

```text
https://api.artem4ik493.ru/auth/discord/callback
```

The redirect URL in Discord must exactly match `DISCORD_REDIRECT_URI` in `.env`. OAuth scopes used by Modexa are `identify` and `guilds`.

Invite the Discord bot to the test server with only the permissions/intents needed by the features being tested. OAuth login credentials (`DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`) are distinct from the bot token (`DISCORD_BOT_TOKEN`).

## 5. Build and start (Docker Compose v1)

The server currently uses the standalone `docker-compose` command, so use that rather than `docker compose`.

```bash
cd /opt/modexa
docker-compose config
docker-compose up -d --build
docker-compose ps
docker-compose logs --tail=200 modexa
```

The first build can take several minutes. The image installs workspace development tools because the current API starts the Runner from TypeScript using `tsx`.

## 6. Verify

From the server:

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS https://api.artem4ik493.ru/health
```

Then open `https://api.artem4ik493.ru/`, sign in with Discord, check the server list, and test the Telegram/Discord adapters.

Useful commands:

```bash
docker-compose ps
docker-compose logs -f modexa
docker-compose restart modexa
docker-compose up -d --build
```

Stop the container without deleting the SQLite data:

```bash
docker-compose down
```

Persistent database files are in `/opt/modexa/data`. Back up that directory before updates or experiments. Do not run two Modexa containers against the same SQLite database.

## 7. Update and rollback

Before updating, back up the data directory. Then:

```bash
cd /opt/modexa
cp -a data "data-backup-$(date +%Y%m%d-%H%M%S)"
git pull
docker-compose up -d --build
docker-compose logs --tail=200 modexa
```

If the new version fails, stop and inspect logs before making further changes. Restore the matching source revision and database backup if a rollback is needed.

## Notes

- The container is reachable from aaPanel through `127.0.0.1:3000` only. Keep this binding.
- No database server is needed: Modexa uses SQLite in the persistent `data` directory.
- No separate Runner container is needed: the API starts and supervises the Runner.
- This deployment does not install a VPN or configure outbound proxying. Before launch, verify that the server can reach Discord and Telegram APIs. If outbound connections are blocked by the hosting network, resolve network access separately; the HTTPS reverse proxy does not provide outbound connectivity.
- The image is configured for a test deployment, not yet hardened as a minimal production image. It currently includes TypeScript runtime/build tools because the Runner is launched from source.
