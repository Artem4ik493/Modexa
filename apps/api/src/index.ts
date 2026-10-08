import { createServer } from "http";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "http";
import {
  ModexaDatabase,
  BackupService,
  CommandRegistry,
  listCommandDescriptors,
  createBuiltinCommands,
  createPublicFeatureCommands,
  createMemberCommand,
  createMembersCommand,
  createRoleCommand,
  createModerationCommands,
  createModerationRestoreCommands,
  createRuntimeServices
} from "@modexa/core";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const apiKey = process.env.MODEXA_API_KEY ?? "change-me";
const database = new ModexaDatabase({
  path: process.env.MODEXA_DATABASE_PATH ?? "data/modexa.sqlite"
});
const backup = new BackupService(database);
const runtimeServices = createRuntimeServices(undefined, database);
const accessControlService = runtimeServices.accessControlService;

if (!accessControlService) {
  throw new Error("Modexa AccessControlService is not initialized");
}

const commandRegistry = new CommandRegistry();
createBuiltinCommands(
  commandRegistry,
  runtimeServices.communityService,
  runtimeServices.identityService,
  runtimeServices.membershipService,
  accessControlService,
  database,
  runtimeServices.bridgeService
);

for (const command of createPublicFeatureCommands(
  commandRegistry,
  runtimeServices.identityService,
  runtimeServices.membershipService,
  runtimeServices.communityService,
  runtimeServices.commandSettingsService,
  runtimeServices.moderationService,
  undefined,
  undefined,
  undefined
)) {
  commandRegistry.register(command);
}

commandRegistry.register(createMemberCommand(
  runtimeServices.identityService,
  runtimeServices.membershipService,
  accessControlService
));
commandRegistry.register(createMembersCommand(
  runtimeServices.identityService,
  runtimeServices.membershipService,
  accessControlService
));
commandRegistry.register(createRoleCommand(
  runtimeServices.identityService,
  runtimeServices.membershipService,
  accessControlService
));
for (const command of createModerationCommands(
  runtimeServices.identityService,
  runtimeServices.membershipService,
  runtimeServices.communityService,
  runtimeServices.moderationService
)) {
  commandRegistry.register(command);
}
for (const command of createModerationRestoreCommands(
  runtimeServices.identityService,
  runtimeServices.membershipService,
  runtimeServices.communityService,
  runtimeServices.moderationService,
  async () => undefined
)) {
  commandRegistry.register(command);
}
const commandCatalog = listCommandDescriptors(commandRegistry);
const dashboardPath = resolve(process.cwd(), "apps/dashboard/index.html");
const dashboardAssetsPath = resolve(process.cwd(), "apps/dashboard/assets");

const discordClientId = process.env.DISCORD_CLIENT_ID ?? "";
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET ?? "";
const runnerCommand = process.execPath;
const runnerArgs = ["--env-file=.env", "--import=tsx", "apps/runner/src/index.ts"];
let runnerProcess: ChildProcess | undefined;
let runnerStartedAt: string | undefined;
let runnerLastExit: { code: number | null; signal: string | null; at: string } | undefined;

const discordRedirectUri =
  process.env.DISCORD_REDIRECT_URI ??
  `http://localhost:${port}/auth/discord/callback`;
const dashboardUrl =
  process.env.MODEXA_DASHBOARD_URL ??
  `http://localhost:${port}/`;

type DiscordSession = {
  id: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  user: {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string;
  };
};

const discordSessions = new Map<string, DiscordSession>();
const oauthStates = new Map<string, number>();

async function discordToken(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: discordClientId,
    client_secret: discordClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: discordRedirectUri
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Discord OAuth token exchange failed: ${response.status}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

async function discordApi<T>(
  path: string,
  accessToken: string
): Promise<T> {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Discord API failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function cookieValue(req: IncomingMessage, name: string): string | undefined {
  return (req.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function discordSession(req: IncomingMessage): DiscordSession | undefined {
  const id = cookieValue(req, "modexa_session");
  if (!id) return undefined;
  const session = discordSessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    discordSessions.delete(id);
    return undefined;
  }
  return session;
}

function dashboardAuthorized(req: IncomingMessage): boolean {
  return Boolean(discordSession(req)) || authorized(req);
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

function json(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*"
  });
  res.end(body);
}

function authorized(req: IncomingMessage): boolean {
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (supplied === apiKey) return true;

  const cookie = req.headers.cookie ?? "";
  const session = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("modexa_api_key="))
    ?.slice("modexa_api_key=".length);

  return session === apiKey;
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body.trim()) return {};
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function startRunner(): void {
  if (runnerProcess && runnerProcess.exitCode === null && !runnerProcess.killed) return;
  runnerProcess = spawn(runnerCommand, runnerArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    windowsHide: false
  });
  runnerStartedAt = new Date().toISOString();
  runnerLastExit = undefined;
  runnerProcess.on("exit", (code, signal) => {
    runnerLastExit = { code, signal, at: new Date().toISOString() };
    runnerProcess = undefined;
  });
}

async function stopRunner(): Promise<void> {
  const child = runnerProcess;
  if (!child) return;
  runnerProcess = undefined;
  if (child.exitCode !== null || child.killed) return;
  child.kill();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 3000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function runnerStatus() {
  return {
    state: runnerProcess && runnerProcess.exitCode === null && !runnerProcess.killed ? "running" : "stopped",
    pid: runnerProcess?.pid ?? null,
    startedAt: runnerStartedAt ?? null,
    lastExit: runnerLastExit ?? null,
    adapters: {
      discord: Boolean(process.env.DISCORD_BOT_TOKEN),
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN)
    }
  };
}

function apiKeyCookie(apiKeyValue: string): string {
  return `modexa_api_key=${encodeURIComponent(apiKeyValue)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`;
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "authorization,content-type"
      });
      res.end();
      return;
    }

    if (url.pathname.startsWith("/assets/")) {
      const assetName = url.pathname.slice("/assets/".length);

      if (
        !assetName ||
        assetName.includes("/") ||
        assetName.includes("\\") ||
        assetName.includes("..")
      ) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        res.end("Invalid asset path");
        return;
      }

      const assetPath = resolve(dashboardAssetsPath, assetName);
      const assetTypes: Record<string, string> = {
        ".png": "image/png",
        ".ico": "image/x-icon",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg"
      };
      const extension = assetName.slice(assetName.lastIndexOf(".")).toLowerCase();
      const contentType = assetTypes[extension];

      if (!contentType) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Asset not found");
        return;
      }

      try {
        const asset = readFileSync(assetPath);
        res.writeHead(200, {
          "content-type": contentType,
          "cache-control": "public, max-age=3600"
        });
        res.end(asset);
      } catch {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Asset not found");
      }

      return;
    }

    if (url.pathname === "/" || url.pathname === "/dashboard") {
      const html = readFileSync(dashboardPath, "utf8");
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      });
      res.end(html);
      return;
    }

    if (url.pathname === "/auth/discord") {
      if (!discordClientId || !discordClientSecret) {
        res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
        res.end("Discord OAuth is not configured");
        return;
      }

      const state = randomBytes(24).toString("hex");
      oauthStates.set(state, Date.now() + 10 * 60_000);

      const authorize = new URL("https://discord.com/oauth2/authorize");
      authorize.searchParams.set("client_id", discordClientId);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("redirect_uri", discordRedirectUri);
      authorize.searchParams.set("scope", "identify guilds");
      authorize.searchParams.set("state", state);

      res.writeHead(302, {
        location: authorize.toString(),
        "cache-control": "no-store"
      });
      res.end();
      return;
    }

    if (url.pathname === "/auth/discord/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const expiresAt = state ? oauthStates.get(state) : undefined;

      if (!code || !state || !expiresAt || expiresAt < Date.now()) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        res.end("Invalid Discord OAuth state");
        return;
      }

      oauthStates.delete(state);

      const token = await discordToken(code);
      const user = await discordApi<DiscordSession["user"]>("/users/@me", token.access_token);
      const sessionId = randomUUID();

      discordSessions.set(sessionId, {
        id: sessionId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + token.expires_in * 1000,
        user
      });

      res.writeHead(302, {
        location: dashboardUrl,
        "set-cookie": cookie("modexa_session", sessionId, 7 * 24 * 60 * 60),
        "cache-control": "no-store"
      });
      res.end();
      return;
    }

    if (url.pathname === "/health") {
      json(res, 200, { status: "ok", service: "modexa-api", time: new Date().toISOString() });
      return;
    }

    if (url.pathname === "/api/config" && req.method === "GET") {
      json(res, 200, {
        oauth: { discord: Boolean(discordClientId && discordClientSecret) },
        dashboard: { url: dashboardUrl },
        runtime: runnerStatus()
      });
      return;
    }

    if (url.pathname === "/api/auth" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      let supplied = "";
      try {
        supplied = String((JSON.parse(body) as { key?: unknown }).key ?? "");
      } catch {
        supplied = "";
      }

      if (supplied !== apiKey) {
        json(res, 401, { error: "invalid_credentials" });
        return;
      }

      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": apiKeyCookie(apiKey),
        "cache-control": "no-store"
      });
      res.end(JSON.stringify({ authenticated: true }));
      return;
    }

    if (url.pathname === "/api/auth/discord" && req.method === "GET") {
      const session = discordSession(req);
      if (!session) {
        json(res, 401, { authenticated: false });
        return;
      }

      const modexaIdentity = database.getIdentityByExternalId(
        "discord",
        session.user.id
      );
      const modexaUser = modexaIdentity
        ? database.getUser(modexaIdentity.userId)
        : undefined;

      const linkedIdentities = modexaUser
        ? database.getUserIdentities(modexaUser.id)
        : [];

      json(res, 200, {
        authenticated: true,
        user: session.user,
        modexa: modexaUser
          ? {
              id: modexaUser.id,
              displayName: modexaUser.displayName,
              identities: linkedIdentities
            }
          : null
      });
      return;
    }

    if (url.pathname === "/api/auth/discord" && req.method === "DELETE") {
      const sessionId = cookieValue(req, "modexa_session");
      if (sessionId) discordSessions.delete(sessionId);
      res.writeHead(204, {
        "set-cookie": cookie("modexa_session", "", 0)
      });
      res.end();
      return;
    }

    if (url.pathname === "/api/auth/discord/invite" && req.method === "GET") {
      if (!discordClientId) {
        json(res, 503, { error: "discord_oauth_not_configured" });
        return;
      }
      const invite = new URL("https://discord.com/oauth2/authorize");
      invite.searchParams.set("client_id", discordClientId);
      invite.searchParams.set("scope", "bot applications.commands");
      const permissions = process.env.DISCORD_BOT_PERMISSIONS;
      if (permissions) invite.searchParams.set("permissions", permissions);
      const communityId = url.searchParams.get("communityId");
      const guildId = url.searchParams.get("guildId");
      if (guildId) {
        invite.searchParams.set("guild_id", guildId);
      } else if (communityId) {
        const identity = database.getCommunityIdentitiesSnapshot().find((item) => item.communityId === communityId && item.platform === "discord");
        if (identity) invite.searchParams.set("guild_id", identity.externalId);
      }
      json(res, 200, { url: invite.toString() });
      return;
    }

    if (url.pathname === "/api/auth/discord/guilds" && req.method === "GET") {
      const session = discordSession(req);
      if (!session) {
        json(res, 401, { error: "unauthorized" });
        return;
      }

      const guilds = await discordApi<DiscordGuild[]>(
        "/users/@me/guilds",
        session.accessToken
      );

      const communities = database.getCommunityIdentitiesSnapshot();
      const botGuildIds = new Set(
        communities
          .filter((item) => item.platform === "discord")
          .map((item) => item.externalId)
      );

      json(res, 200, {
        items: guilds
          .filter((guild) => {
            const permissions = BigInt(guild.permissions);
            const isAdministrator = (permissions & 0x8n) === 0x8n;
            const canManageGuild = (permissions & 0x20n) === 0x20n;
            return guild.owner || isAdministrator || canManageGuild;
          })
          .map((guild) => ({
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            owner: guild.owner,
            botInstalled: botGuildIds.has(guild.id),
            communityId: communities.find(
              (item) => item.platform === "discord" && item.externalId === guild.id
            )?.communityId
          }))
      });
      return;
    }

    if (url.pathname === "/api/auth" && req.method === "DELETE") {
      res.writeHead(204, {
        "set-cookie": "modexa_api_key=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
      });
      res.end();
      return;
    }

    if (!dashboardAuthorized(req)) {
      json(res, 401, { error: "unauthorized" });
      return;
    }

    if (url.pathname === "/api/runtime" && req.method === "GET") {
      json(res, 200, runnerStatus());
      return;
    }

    if (url.pathname === "/api/runtime" && req.method === "POST") {
      const body = await readJsonBody(req);
      const action = typeof body.action === "string" ? body.action : "";
      if (action === "start") startRunner();
      else if (action === "stop") await stopRunner();
      else if (action === "restart") { await stopRunner(); startRunner(); }
      else { json(res, 400, { error: "action must be start, stop or restart" }); return; }
      json(res, 200, runnerStatus());
      return;
    }

    if (url.pathname === "/api/community/mode" && req.method === "POST") {
      const body = await readJsonBody(req);
      const communityId = typeof body.communityId === "string" ? body.communityId : "";
      const mode = body.mode === "private" || body.mode === "public" ? body.mode : "";
      if (!communityId || !mode) { json(res, 400, { error: "communityId and mode are required" }); return; }
      const community = database.getCommunitiesSnapshot().find((item) => item.id === communityId);
      if (!community) { json(res, 404, { error: "community_not_found" }); return; }
      database.upsertCommunity({ ...community, mode, updatedAt: new Date() });
      json(res, 200, { updated: true, communityId, mode });
      return;
    }

    if (url.pathname === "/api/overview" && req.method === "GET") {
      const communities = database.getCommunitiesSnapshot();
      const cases = database.getAllModerationCases();
      json(res, 200, {
        communities: communities.length,
        activeCommunities: communities.filter((item) => item.mode === "public").length,
        moderationCases: cases.length,
        activeModerationCases: cases.filter((item) => item.status === "active").length,
        updatedAt: new Date().toISOString()
      });
      return;
    }

    if (url.pathname === "/api/billing" && req.method === "GET") {
      json(res, 200, database.getRuntimeState("billing") ?? {
        subscriptions: [],
        overrides: [],
        nextSubscriptionId: 1
      });
      return;
    }

    if (url.pathname === "/api/automations" && req.method === "GET") {
      const communityId = url.searchParams.get("communityId") ?? undefined;
      json(res, 200, {
        items: runtimeServices.automationService.list(communityId)
      });
      return;
    }

    if (url.pathname === "/api/bridge" && req.method === "GET") {
      json(res, 200, {
        endpoints: database.getBridgeEndpoints(),
        links: database.getBridgeLinks()
      });
      return;
    }

    if (url.pathname === "/api/commands" && req.method === "GET") {
      const communityId = url.searchParams.get("communityId");
      if (!communityId) {
        json(res, 400, { error: "communityId is required" });
        return;
      }

      const settings = new Map(
        database
          .getCommandSettings(communityId)
          .map((item) => [item.commandName, item.enabled])
      );

      json(res, 200, {
        items: commandCatalog.map((command) => ({
          ...command,
          enabled: settings.get(command.name) ?? true
        }))
      });
      return;
    }

    if (url.pathname === "/api/command-settings" && req.method === "GET") {
      const communityId = url.searchParams.get("communityId");
      if (!communityId) {
        json(res, 400, { error: "communityId is required" });
        return;
      }
      json(res, 200, { items: database.getCommandSettings(communityId) });
      return;
    }

    if (url.pathname === "/api/communities" && req.method === "GET") {
      json(res, 200, { items: database.getCommunitiesSnapshot() });
      return;
    }

    if (url.pathname === "/api/system" && req.method === "GET") {
      json(res, 200, {
        maintenanceMode: database.getSystemSetting("maintenance_mode") === "true"
      });
      return;
    }

    if (url.pathname === "/api/system" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (typeof body.maintenanceMode !== "boolean") {
        json(res, 400, { error: "maintenanceMode must be boolean" });
        return;
      }

      database.setSystemSetting(
        "maintenance_mode",
        String(body.maintenanceMode)
      );

      json(res, 200, {
        updated: true,
        maintenanceMode: body.maintenanceMode
      });
      return;
    }

    if (url.pathname === "/api/automations" && req.method === "POST") {
      const body = await readJsonBody(req);
      const communityId = typeof body.communityId === "string" ? body.communityId : "";
      const name = typeof body.name === "string" ? body.name : "";
      const trigger = body.trigger;
      const action = body.action;

      if (!communityId || !name || !trigger || typeof trigger !== "object" || !action || typeof action !== "object") {
        json(res, 400, { error: "communityId, name, trigger and action are required" });
        return;
      }

      try {
        const automation = runtimeServices.automationService.create({
          communityId,
          name,
          trigger: trigger as never,
          action: action as never
        });
        json(res, 201, automation);
      } catch (error) {
        json(res, 400, {
          error: error instanceof Error ? error.message : "automation_create_failed"
        });
      }
      return;
    }

    if (url.pathname.startsWith("/api/automations/") && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/api/automations/".length));
      const body = await readJsonBody(req);

      if (typeof body.enabled !== "boolean") {
        json(res, 400, { error: "enabled must be boolean" });
        return;
      }

      try {
        json(res, 200, runtimeServices.automationService.setEnabled(id, body.enabled));
      } catch (error) {
        json(res, 404, {
          error: error instanceof Error ? error.message : "automation_not_found"
        });
      }
      return;
    }

    if (url.pathname === "/api/command-settings" && req.method === "POST") {
      const body = await readJsonBody(req);
      const communityId = typeof body.communityId === "string" ? body.communityId : "";
      const commandName = typeof body.commandName === "string" ? body.commandName : "";
      const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;
      if (!communityId || !commandName || enabled === undefined) {
        json(res, 400, { error: "communityId, commandName and enabled are required" });
        return;
      }
      database.setCommandEnabled(communityId, commandName, enabled);
      json(res, 200, { updated: true });
      return;
    }

    if (url.pathname === "/api/audit" && req.method === "GET") {
      const communityId = url.searchParams.get("communityId");
      if (!communityId) {
        json(res, 400, { error: "communityId is required" });
        return;
      }
      json(res, 200, { items: database.getAuditEntries(communityId, 200) });
      return;
    }

    if (url.pathname === "/api/moderation" && req.method === "GET") {
      const communityId = url.searchParams.get("communityId");
      if (!communityId) {
        json(res, 400, { error: "communityId is required" });
        return;
      }
      json(res, 200, { items: database.getModerationCases(communityId) });
      return;
    }

    if (url.pathname === "/api/backup" && req.method === "GET") {
      const artifact = backup.exportSnapshot();
      json(res, 200, artifact);
      return;
    }

    json(res, 404, { error: "not_found" });
  })().catch((error) => {
    json(res, 500, { error: error instanceof Error ? error.message : "internal_error" });
  });
});

server.listen(port, host, () => {
  console.log(`Modexa API listening on http://${host}:${port}`);
  startRunner();
});

async function shutdown(): Promise<void> {
  await stopRunner();
  database.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
