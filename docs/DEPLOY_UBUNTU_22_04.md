# Modexa test deployment — Germany Docker node + Russian aaPanel reverse proxy

The Modexa container runs on the **German node**. A separate **Russian server running aaPanel/Nginx** owns the public domain and HTTPS certificate and proxies requests to the German node. aaPanel is not installed on the German node.

Target public URL: `https://api.artem4ik493.ru/`.

## Network layout

```text
Browser
  | HTTPS
  v
api.artem4ik493.ru -> DNS A record -> RUSSIAN server (aaPanel/Nginx)
                                      | reverse proxy
                                      v
                               GERMAN node:3000
                               Docker / Modexa API + Dashboard + Runner
                                      |
                                      v
                               Persistent SQLite data/
```

## 1. DNS and the Russian aaPanel server

1. Set the DNS `A` record for `api.artem4ik493.ru` to the **public IP of the Russian server**, not the German node.
2. In aaPanel on the Russian server, add website/domain `api.artem4ik493.ru`.
3. Issue and enable a valid HTTPS certificate on the Russian server.
4. Configure aaPanel's reverse proxy to the German node's public IP and port 3000, e.g. `http://GERMAN_NODE_PUBLIC_IP:3000`.
5. Preserve the original `Host` header. Pass `X-Forwarded-Proto $scheme`, `X-Forwarded-For $proxy_add_x_forwarded_for`, and `X-Real-IP $remote_addr` to the upstream.
6. Do not change the ports or proxy configuration of existing sites on the Russian server.

The public browser connection uses HTTPS to the Russian server. If the upstream is configured as HTTP, traffic between the Russian and German servers is **not encrypted**. For anything beyond a brief isolated test, configure TLS on the German upstream (with certificate validation) or an encrypted private tunnel before using real accounts/sessions. Do not send real credentials over a plain HTTP upstream on an untrusted network.

## 2. Firewall on the German node

The container publishes port 3000 so the Russian reverse proxy can reach it. Do not allow arbitrary internet clients to reach it.

In the German node's provider firewall and/or UFW, allow inbound TCP port 3000 **only from the Russian server's public IP**. Example with UFW (replace `RUSSIAN_SERVER_PUBLIC_IP`):

```bash
sudo ufw allow from RUSSIAN_SERVER_PUBLIC_IP to any port 3000 proto tcp
sudo ufw status numbered
```

Before enabling UFW, check existing SSH rules and the current firewall policy so you do not lock yourself out. Do not run a broad `ufw allow 3000`. If a provider-level firewall is available, apply the same source-IP restriction there too.

## 3. Get the project on the German node

Run the following on the **German node**. Use the existing checkout if present; otherwise clone the private repository using authorized GitHub access.

```bash
cd /opt/modexa
git pull
```

## 4. Create the environment file and persistent data directory on Germany

```bash
cd /opt/modexa
cp .env.example .env
mkdir -p data
chown -R 1000:1000 data
chmod 700 data
chmod 600 .env
nano .env
```

Set the required values:

- `TELEGRAM_BOT_TOKEN`: Telegram bot token from BotFather.
- `DISCORD_BOT_TOKEN`: Discord bot token.
- `MODEXA_API_KEY`: unique random secret of at least 32 characters. Generate with `openssl rand -hex 32`.
- `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`: OAuth application credentials.
- `DISCORD_REDIRECT_URI=https://api.artem4ik493.ru/auth/discord/callback`
- `MODEXA_DASHBOARD_URL=https://api.artem4ik493.ru/`
- `MODEXA_DATABASE_PATH=/app/data/modexa.sqlite`
- `HOST=0.0.0.0` and `PORT=3000`

Leave `MODEXA_ALLOWED_ORIGINS` empty because Dashboard and API use the same public origin. Never commit or share `.env`.

## 5. Discord Developer Portal

Under **OAuth2 → General → Redirects**, add this exact URL:

```text
https://api.artem4ik493.ru/auth/discord/callback
```

It must exactly match `DISCORD_REDIRECT_URI` in the German node's `.env`. Modexa uses OAuth scopes `identify` and `guilds`.

## 6. Build and start on Germany

This server uses the standalone `docker-compose` command (Compose v1), so use that command:

```bash
cd /opt/modexa
docker-compose config
docker-compose up -d --build
docker-compose ps
docker-compose logs --tail=200 modexa
```

The first build may take several minutes. The image installs workspace development tools because the current API starts the Runner from TypeScript via `tsx`.

## 7. Verify the connection

On the German node:

```bash
curl -fsS http://127.0.0.1:3000/health
```

On the Russian server, verify that the German upstream is reachable (replace the IP):

```bash
curl -v http://GERMAN_NODE_PUBLIC_IP:3000/health
```

Then verify the public route:

```bash
curl -fsS https://api.artem4ik493.ru/health
```

Finally open `https://api.artem4ik493.ru/`, sign in with Discord, and test both bots. If the public URL returns 502, check the aaPanel/Nginx error log, German firewall rules, and `docker-compose logs -f modexa`.

## 8. Updates and persistence

Database files persist on the German node in `/opt/modexa/data`.

```bash
cd /opt/modexa
cp -a data "data-backup-$(date +%Y%m%d-%H%M%S)"
git pull
docker-compose up -d --build
docker-compose logs --tail=200 modexa
```

Stop the container without deleting the database:

```bash
docker-compose down
```

## Notes

- Do not install aaPanel on Germany for this setup.
- Do not point the public domain's DNS to Germany; the public DNS points to the Russian aaPanel server.
- Keep TCP/3000 restricted to the Russian proxy server IP.
- This does not configure a VPN or outbound proxy. If the German node cannot reach Telegram/Discord APIs, that is a separate outbound-connectivity issue.
- The current Docker image is for a test deployment and includes TypeScript runtime/build tools because the Runner is launched from source.
