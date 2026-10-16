import { createServer } from "http";
import { spawn, type ChildProcess } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
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
const apiKey = process.env.MODEXA_API_KEY ?? "";
if (apiKey.length < 32 || apiKey === "change-me" || apiKey === "REPLACE_WITH_A_LONG_RANDOM_SECRET") {
  throw new Error("MODEXA_API_KEY must be configured with a random secret of at least 32 characters");
}
const allowedOrigins = new Set((process.env.MODEXA_ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean));
const database = new ModexaDatabase({
  path: process.env.MODEXA_DATABASE_PATH ?? "data/modexa.sqlite"
});
const backup = new BackupService(database);
const runtimeServices = createRuntimeServices(undefined, database);
for (const community of database.getCommunitiesSnapshot()) {
  const ranking = database.getRuntimeState<Record<string, unknown>>(`api.ranking.${community.id}`);
  if (ranking) runtimeServices.rankingService.setSettings(community.id, ranking as never);
  const welcome = database.getRuntimeState<Record<string, unknown>>(`api.welcome.${community.id}`);
  if (welcome) runtimeServices.welcomeService.setSettings(community.id, welcome as never);
}
for (const command of database.getRuntimeState<Array<Record<string, unknown>>>("api.custom_commands") ?? []) {
  runtimeServices.customCommandService.upsert(command as never);
}
function enqueueAdapterAction(action: unknown, communityId: string, source: string): { id: string } {
  const queue = database.getRuntimeState<Array<Record<string, unknown>>>("api.action_queue") ?? [];
  const item = { id: `action-${randomUUID()}`, communityId, source, action, status: "pending", createdAt: new Date().toISOString() };
  database.setRuntimeState("api.action_queue", [...queue, item].slice(-1000));
  return { id: item.id };
}

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
const runnerLogs: Array<{ at: string; stream: "stdout" | "stderr"; message: string }> = [];
function appendRunnerLog(stream: "stdout" | "stderr", chunk: Buffer | string): void {
  for (const line of String(chunk).split(/\\r?\\n/).filter(Boolean)) {
    runnerLogs.push({ at: new Date().toISOString(), stream, message: line.slice(0, 4000) });
  }
  if (runnerLogs.length > 500) runnerLogs.splice(0, runnerLogs.length - 500);
}

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
  accessTokenExpiresAt: number;
  user: {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string;
  };
};

const discordSessions = new Map<string, DiscordSession>();
const sessionEncryptionKey = createHash("sha256").update(apiKey).digest();
type OwnerSession = { id: string; expiresAt: number; createdAt: number };

const ownerSessions = new Map<string, OwnerSession>();
const OWNER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OWNER_SESSION_COOKIE = "modexa_owner_session";

function persistOwnerSessions(): void {
  const value = JSON.stringify([...ownerSessions.values()]);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionEncryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  database.setRuntimeState("api.owner_sessions_encrypted", Buffer.concat([iv, tag, encrypted]).toString("base64"));
}

function restoreOwnerSessions(): void {
  const stored = database.getRuntimeState<string>("api.owner_sessions_encrypted");
  if (!stored) return;
  try {
    const bytes = Buffer.from(stored, "base64");
    if (bytes.length < 29) throw new Error("Invalid encrypted owner session state");
    const decipher = createDecipheriv("aes-256-gcm", sessionEncryptionKey, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const raw = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
    const sessions = JSON.parse(raw) as OwnerSession[];
    for (const session of sessions) {
      if (session.expiresAt > Date.now()) ownerSessions.set(session.id, session);
    }
    if (sessions.length !== ownerSessions.size) persistOwnerSessions();
  } catch {
    // Rotating MODEXA_API_KEY invalidates persisted owner sessions safely.
    database.setRuntimeState("api.owner_sessions_encrypted", "");
  }
}

function createOwnerSession(): OwnerSession {
  const now = Date.now();
  const session = { id: randomBytes(32).toString("hex"), createdAt: now, expiresAt: now + OWNER_SESSION_TTL_MS };
  ownerSessions.set(session.id, session);
  persistOwnerSessions();
  return session;
}

function ownerSession(req: IncomingMessage): OwnerSession | undefined {
  const id = cookieValue(req, OWNER_SESSION_COOKIE);
  if (!id) return undefined;
  const session = ownerSessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) {
      ownerSessions.delete(id);
      persistOwnerSessions();
    }
    return undefined;
  }
  return session;
}

function persistDiscordSessions(): void {
  const value = JSON.stringify([...discordSessions.values()]);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionEncryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  database.setRuntimeState("api.discord_sessions_encrypted", Buffer.concat([iv, tag, encrypted]).toString("base64"));
}
function restoreDiscordSessions(): void {
  const stored = database.getRuntimeState<string>("api.discord_sessions_encrypted");
  if (!stored) return;
  try {
    const bytes = Buffer.from(stored, "base64");
    if (bytes.length < 29) throw new Error("Invalid encrypted session state");
    const decipher = createDecipheriv("aes-256-gcm", sessionEncryptionKey, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const raw = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
    const sessions = JSON.parse(raw) as DiscordSession[];
    for (const session of sessions) {
      if (session.expiresAt > Date.now()) discordSessions.set(session.id, session);
    }
    if (sessions.length !== discordSessions.size) persistDiscordSessions();
  } catch {
    // A changed API key invalidates encrypted sessions safely; users can sign in again.
    database.setRuntimeState("api.discord_sessions_encrypted", "");
  }
}
restoreOwnerSessions();
restoreDiscordSessions();
const oauthStates = new Map<string, number>();
const oauthHandoffs = new Map<string, { sessionId: string; expiresAt: number }>();

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
  let token = accessToken;
  let session = [...discordSessions.values()].find((item) => item.accessToken === accessToken);
  if (session && session.accessTokenExpiresAt <= Date.now() + 60_000 && session.refreshToken) {
    const body = new URLSearchParams({
      client_id: discordClientId,
      client_secret: discordClientSecret,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken
    });
    const refreshed = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (refreshed.ok) {
      const result = await refreshed.json() as { access_token: string; refresh_token?: string; expires_in: number };
      session.accessToken = result.access_token;
      session.refreshToken = result.refresh_token ?? session.refreshToken;
      session.accessTokenExpiresAt = Date.now() + result.expires_in * 1000;
      token = session.accessToken;
      persistDiscordSessions();
    } else if (refreshed.status === 400 || refreshed.status === 401) {
      discordSessions.delete(session.id);
      persistDiscordSessions();
      throw new Error("Discord session expired; sign in again");
    }
  }
  if (path === "/users/@me/guilds" && session) {
    const cached = discordGuildCache.get(session.id);
    if (cached && cached.expiresAt > Date.now()) return cached.guilds as T;
    if (cached) discordGuildCache.delete(session.id);
  }

  let response = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (response.status === 401 && session?.refreshToken) {
    const body = new URLSearchParams({
      client_id: discordClientId,
      client_secret: discordClientSecret,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken
    });
    const refreshed = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (refreshed.ok) {
      const result = await refreshed.json() as { access_token: string; refresh_token?: string; expires_in: number };
      session.accessToken = result.access_token;
      session.refreshToken = result.refresh_token ?? session.refreshToken;
      session.accessTokenExpiresAt = Date.now() + result.expires_in * 1000;
      persistDiscordSessions();
      response = await fetch(`https://discord.com/api/v10${path}`, {
        headers: { authorization: `Bearer ${session.accessToken}` }
      });
    }
  }
  if (!response.ok) {
    if (response.status === 429) {
      let retryAfterSeconds = Number(response.headers.get("retry-after"));
      try {
        const body = await response.clone().json() as { retry_after?: number };
        if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
          retryAfterSeconds = Number(body.retry_after);
        }
      } catch {}
      if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) retryAfterSeconds = 1;
      throw new DiscordApiError(429, Math.ceil(retryAfterSeconds));
    }
    throw new DiscordApiError(response.status);
  }

  const data = await response.json() as T;
  if (path === "/users/@me/guilds" && session && Array.isArray(data)) {
    discordGuildCache.set(session.id, {
      expiresAt: Date.now() + DISCORD_GUILD_CACHE_TTL_MS,
      guilds: data as DiscordGuild[]
    });
  }
  return data;
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
    if (session) {
      discordSessions.delete(id);
      persistDiscordSessions();
    }
    return undefined;
  }
  return session;
}

function dashboardAuthorized(req: IncomingMessage): boolean {
  return Boolean(discordSession(req)) || authorized(req);
}

function requestIsSecure(req: IncomingMessage): boolean {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proxyProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  if (proxyProto) return proxyProto.split(",")[0].trim().toLowerCase() === "https";
  if (Boolean((req.socket as typeof req.socket & { encrypted?: boolean }).encrypted)) return true;
  const origin = req.headers.origin;
  if (origin) {
    try { return new URL(origin).protocol === "https:"; } catch { return false; }
  }
  const host = (req.headers.host ?? "").split(":")[0].toLowerCase();
  let configuredHost = "";
  try { configuredHost = new URL(dashboardUrl).hostname.toLowerCase(); } catch {}
  return dashboardUrl.startsWith("https://") && Boolean(host) && host === configuredHost;
}

function cookie(name: string, value: string, maxAge: number, req?: IncomingMessage): string {
  const secure = (req ? requestIsSecure(req) : dashboardUrl.startsWith("https://")) ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions?: string;
  permissions_new?: string;
};

class DiscordApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(status: number, retryAfterSeconds?: number) {
    super(status === 429 ? "Discord API rate limited the request" : `Discord API failed: ${status}`);
    this.name = "DiscordApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const discordGuildCache = new Map<string, { expiresAt: number; guilds: DiscordGuild[] }>();
const DISCORD_GUILD_CACHE_TTL_MS = 60_000;

function discordGuildPermissions(guild: DiscordGuild): bigint {
  const raw = guild.permissions_new ?? guild.permissions ?? "0";
  try { return BigInt(raw); } catch { return 0n; }
}

function json(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(body);
}

function authorized(req: IncomingMessage): boolean {
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (supplied === apiKey) return true;
  if (ownerSession(req)) return true;

  // Migration path for old browser cookies: GET /api/auth rotates these to
  // opaque server-side sessions instead of leaving the API key in the browser.
  const legacyCookie = cookieValue(req, "modexa_api_key");
  let decodedLegacyCookie = "";
  try { decodedLegacyCookie = legacyCookie ? decodeURIComponent(legacyCookie) : ""; } catch { return false; }
  return decodedLegacyCookie === apiKey;
}

const parsedRequestBodies = new WeakMap<IncomingMessage, Record<string, unknown>>();

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const cached = parsedRequestBodies.get(req);
  if (cached) return cached;
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 1_048_576) throw new Error("request_body_too_large");
  }
  if (!body.trim()) {
    const empty: Record<string, unknown> = {};
    parsedRequestBodies.set(req, empty);
    return empty;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("invalid_json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("json_object_required");
  }
  const result = parsed as Record<string, unknown>;
  parsedRequestBodies.set(req, result);
  return result;
}

async function canManageDiscordCommunity(req: IncomingMessage, communityId: string): Promise<boolean> {
  const session = discordSession(req);
  if (!session) return false;
  const identity = database.getCommunityIdentitiesSnapshot(communityId)
    .find((item) => item.platform === "discord");
  if (!identity) return false;
  try {
    const guilds = await discordApi<DiscordGuild[]>("/users/@me/guilds", session.accessToken);
    const guild = guilds.find((item) => item.id === identity.externalId);
    if (!guild) return false;
    const permissions = discordGuildPermissions(guild);
    return guild.owner || (permissions & 0x8n) === 0x8n || (permissions & 0x20n) === 0x20n;
  } catch {
    return false;
  }
}

function isCommunityScopedReadPath(path: string, method: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  if (path === "/api/commands" || path === "/api/command-settings" ||
      path === "/api/analytics" || path === "/api/audit" ||
      path === "/api/moderation" || path === "/api/custom-commands" ||
      path === "/api/automations") return true;
  if (/^\/api\/communities\/[^/]+(?:\/.*)?$/.test(path)) return true;
  return false;
}

function isCommunityScopedMutationPath(path: string, method: string): boolean {
  if (method === "POST" && ["/api/automations", "/api/custom-commands", "/api/moderation/cases", "/api/moderation/revoke"].includes(path)) return true;
  if (method === "PUT" && path === "/api/command-settings") return true;
  if (/^\/api\/automations\/[^/]+$/.test(path) && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;
  if (/^\/api\/custom-commands\/[^/]+$/.test(path) && ["PUT", "PATCH", "DELETE"].includes(method)) return true;
  if (/^\/api\/communities\/[^/]+\/(roles(?:\/[^/]+)?|members\/[^/]+(?:\/roles)?|ranking|welcome(?:\/preview)?|automod\/rules(?:\/[^/]+)?)$/.test(path) &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;
  return false;
}

function isAutomationTrigger(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const trigger = value as Record<string, unknown>;
  if (trigger.type === "interval") return Number.isInteger(trigger.intervalSeconds) && Number(trigger.intervalSeconds) >= 60 && Number(trigger.intervalSeconds) <= 31_536_000;
  if (trigger.type === "message") return typeof trigger.pattern === "string" && trigger.pattern.trim().length > 0 && trigger.pattern.length <= 500;
  if (trigger.type === "command") return typeof trigger.command === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(trigger.command);
  return false;
}

function isAutomationAction(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const action = value as Record<string, unknown>;
  if (action.type === "command") {
    return typeof action.command === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(action.command) &&
      (action.args === undefined || (Array.isArray(action.args) && action.args.length <= 50 && action.args.every((arg) => typeof arg === "string" && arg.length <= 500)));
  }
  if (action.type === "webhook") {
    if (typeof action.url !== "string" || action.url.length > 2000) return false;
    try {
      const parsed = new URL(action.url);
      const host = parsed.hostname.toLowerCase();
      return parsed.protocol === "https:" && !parsed.username && !parsed.password &&
        host !== "localhost" && !host.endsWith(".local") && !host.endsWith(".internal") &&
        !/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) &&
        !/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) && host !== "::1";
    } catch { return false; }
  }
  return false;
}

function startRunner(): void {
  if (runnerProcess && runnerProcess.exitCode === null && !runnerProcess.killed) return;
  runnerProcess = spawn(runnerCommand, runnerArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true
  });
  runnerProcess.stdout?.on("data", (chunk: Buffer) => appendRunnerLog("stdout", chunk));
  runnerProcess.stderr?.on("data", (chunk: Buffer) => appendRunnerLog("stderr", chunk));
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
  if (child.exitCode !== null) {
    runnerProcess = undefined;
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", finish);
      runnerProcess = undefined;
      resolve();
    };
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill();
      finish();
    }, 8000);

    child.once("exit", finish);
    if (child.connected) {
      child.send({ type: "shutdown" }, (error) => {
        if (error && child.exitCode === null) child.kill();
      });
    } else {
      child.kill();
    }
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

function ownerSessionCookie(sessionId: string, req?: IncomingMessage, maxAge = Math.floor(OWNER_SESSION_TTL_MS / 1000)): string {
  return cookie(OWNER_SESSION_COOKIE, sessionId, maxAge, req);
}

function clearOwnerCookies(req?: IncomingMessage): string[] {
  const secure = (req ? requestIsSecure(req) : dashboardUrl.startsWith("https://")) ? "; Secure" : "";
  return [
    cookie(OWNER_SESSION_COOKIE, "", 0, req),
    "modexa_api_key=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" + secure
  ];
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    const requestOrigin = req.headers.origin;
    const requestHost = req.headers.host ?? "localhost";
    const sameOrigin = !requestOrigin || requestOrigin === "http://" + requestHost || requestOrigin === "https://" + requestHost;
    const originAllowed = sameOrigin || allowedOrigins.has(requestOrigin ?? "");

    if (req.method === "OPTIONS") {
      if (!originAllowed) { res.writeHead(403); res.end(); return; }
      res.writeHead(204, {
        "access-control-allow-origin": requestOrigin ?? "",
        "vary": "Origin",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-max-age": "600"
      });
      res.end();
      return;
    }

    if (!originAllowed) {
      json(res, 403, { error: "origin_not_allowed" });
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
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
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

    if (url.pathname === "/login") {
      const configured = Boolean(discordClientId && discordClientSecret);
      const loginPage = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#080b13">
<title>Вход — Modexa</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#070912;color:#f4f7ff}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(800px 500px at 50% 0%,#5138a633,transparent 70%),#070912}.card{width:min(100%,440px);padding:36px;border:1px solid #26314b;border-radius:24px;background:linear-gradient(145deg,#121a2b,#0c111e);box-shadow:0 24px 90px #0006}.brand{display:flex;align-items:center;gap:12px;margin-bottom:32px}.mark{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:#8b5cf622;border:1px solid #8b5cf677;color:#bba4ff;font-weight:900;font-size:24px}.brand strong{display:block;font-size:21px;letter-spacing:-.6px}.brand small{display:block;margin-top:3px;color:#91a0bd;font-size:10px;letter-spacing:2px;text-transform:uppercase}h1{margin:0 0 12px;font-size:29px;letter-spacing:-1px}p{color:#9ba8c2;line-height:1.65;margin:0 0 26px}.login{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;padding:12px 18px;border-radius:12px;background:#8b5cf6;color:white;text-decoration:none;font-weight:800;transition:background .2s,transform .2s}.login:hover{background:#7c4ee8;transform:translateY(-1px)}.notice{margin-top:18px;padding:12px 14px;border-radius:10px;border:1px solid #3b4560;background:#0a1020;color:#aab6cf;font-size:13px;line-height:1.5}.notice.error{border-color:#713a4b;color:#ffb8c4}.foot{margin-top:26px;color:#677590;font-size:12px;text-align:center}
</style>
</head>
<body><main class="card"><div class="brand"><div class="mark">‹›</div><div><strong>Modexa</strong><small>Community OS</small></div></div><h1>Вход в Control Center</h1><p>Войдите через Discord, чтобы открыть панель управления сообществами Modexa.</p>${configured ? '<a class="login" href="/auth/discord">Продолжить через Discord</a>' : '<div class="notice error">Вход пока не настроен. Укажите DISCORD_CLIENT_ID и DISCORD_CLIENT_SECRET в окружении API, а также проверьте DISCORD_REDIRECT_URI.</div>'}<div class="notice">После входа доступ к данным сообществ определяется правами вашей учётной записи.</div><div class="foot">Modexa · Community OS</div></main></body></html>`;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(loginPage);
      return;
    }

    const isDashboardRoute = url.pathname === "/" ||
      url.pathname === "/dashboard" ||
      url.pathname.startsWith("/dashboard/");
    if (isDashboardRoute && !dashboardAuthorized(req)) {
      res.writeHead(302, { location: "/login", "cache-control": "no-store" });
      res.end();
      return;
    }

    const dashboardPageSlugs: Record<string, string> = {
      overview: "overview.html",
      communities: "communities.html",
      members: "members.html",
      roles: "roles.html",
      commands: "commands.html",
      "custom-commands": "custom-commands.html",
      ranking: "ranking.html",
      welcome: "welcome.html",
      moderation: "moderation.html",
      automod: "automod.html",
      automations: "automations.html",
      bridge: "bridge.html",
      audit: "audit.html",
      system: "system.html",
      runtime: "runtime.html"
    };

    const dashboardSlug = url.pathname.startsWith("/dashboard/pages/")
      ? url.pathname.slice("/dashboard/pages/".length).replace(/\.html$/, "")
      : url.pathname.startsWith("/dashboard/")
        ? url.pathname.slice("/dashboard/".length).replace(/\/$/, "").replace(/\.html$/, "")
        : "";

    if (dashboardSlug && dashboardPageSlugs[dashboardSlug]) {
      try {
        const page = readFileSync(resolve(process.cwd(), "apps/dashboard/pages", dashboardPageSlugs[dashboardSlug]!), "utf8");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(page);
      } catch {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Dashboard page not found");
      }
      return;
    }

    if (url.pathname === "/" || url.pathname === "/dashboard" || url.pathname === "/dashboard/") {
      const html = readFileSync(resolve(process.cwd(), "apps/dashboard/pages/overview.html"), "utf8");
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      });
      res.end(html);
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
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        accessTokenExpiresAt: Date.now() + token.expires_in * 1000,
        user
      });
      persistDiscordSessions();

      // Also create a short-lived one-time handoff. This makes OAuth work
      // even when the dashboard is opened as localhost vs 127.0.0.1.
      const handoff = randomBytes(32).toString("hex");
      oauthHandoffs.set(handoff, {
        sessionId,
        expiresAt: Date.now() + 60_000
      });

      const dashboard = new URL("/", dashboardUrl);
      dashboard.searchParams.set("discord_handoff", handoff);
      res.writeHead(302, {
        location: dashboard.toString(),
        "set-cookie": cookie("modexa_session", sessionId, 7 * 24 * 60 * 60, req),
        "cache-control": "no-store",
        "referrer-policy": "no-referrer"
      });
      res.end();
      return;
    }

    if (url.pathname === "/api/openapi.json" && req.method === "GET") {
      json(res, 200, {
        openapi: "3.1.0",
        info: { title: "Modexa API", version: "1.0.0" },
        servers: [{ url: dashboardUrl }],
        security: [{ bearerAuth: [] }],
        components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
        paths: Object.fromEntries(([
          ["/health", ["get"]],
          ["/api/config", ["get"]],
          ["/api/auth", ["post", "delete"]],
          ["/api/runtime", ["get", "post"]],
          ["/api/runtime/logs", ["get"]],
          ["/api/overview", ["get"]],
          ["/api/analytics", ["get"]],
          ["/api/billing", ["get"]],
          ["/api/billing/plans", ["get"]],
          ["/api/billing/subscriptions", ["get", "post"]],
          ["/api/billing/subscriptions/{id}", ["patch", "delete"]],
          ["/api/billing/subscriptions/{id}/features/{feature}", ["put", "delete"]],
          ["/api/communities", ["get", "post"]],
          ["/api/communities/{id}", ["get"]],
          ["/api/communities/{id}/members", ["get"]],
          ["/api/communities/{id}/members/{userId}", ["patch"]],
          ["/api/communities/{id}/members/{userId}/roles", ["get", "post", "delete"]],
          ["/api/communities/{id}/identities", ["get", "post"]],
          ["/api/communities/{id}/roles", ["get", "post"]],
          ["/api/communities/{id}/roles/{roleId}", ["put", "patch", "delete"]],
          ["/api/communities/{id}/settings", ["get", "patch"]],
          ["/api/communities/{id}/ranking", ["get", "put", "patch"]],
          ["/api/communities/{id}/ranking/leaderboard", ["get"]],
          ["/api/communities/{id}/ranking/members/{userId}", ["get"]],
          ["/api/communities/{id}/ranking/cookies", ["post"]],
          ["/api/communities/{id}/welcome", ["get", "put", "patch"]],
          ["/api/communities/{id}/welcome/preview", ["post"]],
          ["/api/communities/{id}/automod/rules", ["get", "post"]],
          ["/api/communities/{id}/automod/rules/{ruleId}", ["delete"]],
          ["/api/communities/{id}/welcome/preview", ["post"]],
          ["/api/users/{id}/settings", ["get", "put", "patch"]],
          ["/api/users/{id}/system-roles", ["get", "post", "delete"]],
          ["/api/automations", ["get", "post"]],
          ["/api/automations/{id}", ["post", "put", "patch", "delete"]],
          ["/api/bridge", ["get"]],
          ["/api/bridge/endpoints", ["post"]],
          ["/api/bridge/endpoints/{id}", ["put", "delete"]],
          ["/api/bridge/links", ["post"]],
          ["/api/bridge/links/{id}", ["delete"]],
          ["/api/commands", ["get"]],
          ["/api/command-settings", ["get", "post", "put"]],
          ["/api/custom-commands", ["get", "post"]],
          ["/api/custom-commands/{id}", ["put", "patch", "delete"]],
          ["/api/audit", ["get"]],
          ["/api/moderation", ["get"]],
          ["/api/moderation/cases", ["post"]],
          ["/api/moderation/revoke", ["post"]],
          ["/api/actions", ["get"]],
          ["/api/actions/{id}", ["get"]],
          ["/api/backup", ["get"]],
          ["/api/system", ["get", "post"]]
        ] as Array<[string, string[]]>).map(([path, methods]) => [path, Object.fromEntries(methods.map((method) => [method, {
          summary: `${String(method).toUpperCase()} ${path}`,
          responses: {
            "200": { description: "Success" },
            "400": { description: "Invalid request" },
            "401": { description: "Unauthorized" },
            "404": { description: "Resource not found" }
          }
        }] as const))] as const))
      });
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

    if (url.pathname === "/api/auth" && req.method === "GET") {
      if (ownerSession(req)) {
        json(res, 200, { authenticated: true, role: "owner" });
        return;
      }

      const legacyCookie = cookieValue(req, "modexa_api_key");
      let decodedLegacyCookie = "";
      try { decodedLegacyCookie = legacyCookie ? decodeURIComponent(legacyCookie) : ""; } catch { decodedLegacyCookie = ""; }
      if (decodedLegacyCookie === apiKey) {
        const session = createOwnerSession();
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": [ownerSessionCookie(session.id, req), clearOwnerCookies(req)[1]],
          "cache-control": "no-store"
        });
        res.end(JSON.stringify({ authenticated: true, role: "owner" }));
        return;
      }

      json(res, 200, { authenticated: false });
      return;
    }

    if (url.pathname === "/api/auth" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 16_384) {
          json(res, 413, { error: "request_body_too_large" });
          return;
        }
      }
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

      const session = createOwnerSession();
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": [ownerSessionCookie(session.id, req), clearOwnerCookies(req)[1]],
        "cache-control": "no-store"
      });
      res.end(JSON.stringify({ authenticated: true, role: "owner" }));
      return;
    }

    if (url.pathname === "/api/auth/discord/handoff" && req.method === "POST") {
      const body = await readJsonBody(req);
      const handoff = typeof body.handoff === "string" ? body.handoff : "";
      const entry = handoff ? oauthHandoffs.get(handoff) : undefined;
      if (!entry || entry.expiresAt <= Date.now()) {
        if (handoff) oauthHandoffs.delete(handoff);
        json(res, 401, { authenticated: false });
        return;
      }

      oauthHandoffs.delete(handoff);
      const session = discordSessions.get(entry.sessionId);
      if (!session || session.expiresAt <= Date.now()) {
        json(res, 401, { authenticated: false });
        return;
      }

      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": cookie("modexa_session", session.id, Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)), req),
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff"
      });
      res.end(JSON.stringify({
        authenticated: true,
        role: "user",
        user: session.user
      }));
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
        role: "user",
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
      if (sessionId) {
        discordSessions.delete(sessionId);
        persistDiscordSessions();
      }
      res.writeHead(204, {
        "set-cookie": cookie("modexa_session", "", 0, req)
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

      const manageableGuilds = guilds.flatMap((guild) => {
        // Discord may return permissions_new instead of the legacy permissions field.
        const rawPermissions = guild.permissions_new ?? guild.permissions ?? "0";
        let permissions = 0n;
        try { permissions = BigInt(rawPermissions); } catch {}
        const canManageGuild = guild.owner === true ||
          (permissions & 0x8n) === 0x8n ||
          (permissions & 0x20n) === 0x20n;
        return canManageGuild ? [{ guild, canManageGuild }] : [];
      });

      json(res, 200, {
        items: manageableGuilds.map(({ guild, canManageGuild }) => {
            const botInstalled = botGuildIds.has(guild.id);
            return {
              id: guild.id,
              name: guild.name,
              icon: guild.icon,
              owner: guild.owner,
              botInstalled,
              canManageBot: botInstalled && canManageGuild,
              canInviteBot: !botInstalled && canManageGuild,
              communityId: communities.find(
                (item) => item.platform === "discord" && item.externalId === guild.id
              )?.communityId
            };
          })
      });
      return;
    }

    if (url.pathname === "/api/telegram/groups/pending" && req.method === "GET") {
      if (!authorized(req)) {
        const communityId = url.searchParams.get("communityId") ?? "";
        if (!communityId || !database.getCommunitiesSnapshot().some((item) => item.id === communityId)) {
          json(res, 400, { error: "communityId_required" });
          return;
        }
        if (!await canManageDiscordCommunity(req, communityId)) {
          json(res, 403, { error: "community_management_forbidden" });
          return;
        }
      }
      const now = Date.now();
      const pending = (database.getRuntimeState<Array<{
        code: string; chatId: string; chatTitle: string; requestedBy: string;
        createdAt: string; expiresAt: string;
      }>>("telegram.pending_group_links") ?? []).filter((item) => Date.parse(item.expiresAt) > now);
      database.setRuntimeState("telegram.pending_group_links", pending);
      json(res, 200, { items: pending.map((item) => ({
        chatId: item.chatId, chatTitle: item.chatTitle,
        createdAt: item.createdAt, expiresAt: item.expiresAt
      })) });
      return;
    }

    if (url.pathname === "/api/telegram/groups/linked" && req.method === "GET") {
      const communityId = url.searchParams.get("communityId") ?? "";
      if (!communityId || !database.getCommunitiesSnapshot().some((item) => item.id === communityId)) {
        json(res, 400, { error: "communityId_required" });
        return;
      }
      if (!authorized(req) && !ownerSession(req) && !await canManageDiscordCommunity(req, communityId)) {
        json(res, 403, { error: "community_management_forbidden" });
        return;
      }
      const items = database.getCommunityIdentitiesSnapshot(communityId)
        .filter((item) => item.platform === "telegram")
        .map((item) => ({ chatId: item.externalId, chatTitle: item.name ?? item.externalId, communityId: item.communityId }));
      json(res, 200, { items });
      return;
    }

    if (url.pathname === "/api/telegram/groups/unlink" && req.method === "POST") {
      const body = await readJsonBody(req);
      const communityId = typeof body.communityId === "string" ? body.communityId : "";
      const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
      if (!communityId || !chatId) { json(res, 400, { error: "communityId_and_chatId_required" }); return; }
      if (!database.getCommunitiesSnapshot().some((item) => item.id === communityId)) {
        json(res, 404, { error: "community_not_found" }); return;
      }
      if (!authorized(req) && !ownerSession(req) && !await canManageDiscordCommunity(req, communityId)) {
        json(res, 403, { error: "community_management_forbidden" }); return;
      }
      const identity = database.getCommunityIdentitiesSnapshot(communityId)
        .find((item) => item.platform === "telegram" && item.externalId === chatId);
      if (!identity) { json(res, 404, { error: "telegram_group_not_linked" }); return; }
      database.deleteCommunityIdentity(communityId, "telegram", chatId);
      const endpoints = database.getBridgeEndpoints().filter((item) =>
        item.platform === "telegram" && item.communityId === communityId &&
        (item.communityExternalId === chatId || item.channelExternalId === chatId)
      );
      for (const endpoint of endpoints) database.deleteBridgeEndpoint(endpoint.id);
      json(res, 200, { unlinked: true, chatId });
      return;
    }

    if (url.pathname === "/api/telegram/groups/link" && req.method === "POST") {
      const body = await readJsonBody(req);
      const communityId = typeof body.communityId === "string" ? body.communityId : "";
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      if (!communityId || !/^[A-F0-9]{16}$/.test(code)) {
        json(res, 400, { error: "communityId_and_valid_link_code_required" });
        return;
      }
      const community = database.getCommunitiesSnapshot().find((item) => item.id === communityId);
      if (!community) {
        json(res, 404, { error: "community_not_found" });
        return;
      }

      if (!authorized(req) && !ownerSession(req)) {
        const session = discordSession(req);
        const identity = database.getCommunityIdentitiesSnapshot(communityId)
          .find((item) => item.platform === "discord");
        if (!session || !identity) {
          json(res, 403, { error: "community_management_forbidden" });
          return;
        }
        let guilds: DiscordGuild[];
        try {
          guilds = await discordApi<DiscordGuild[]>("/users/@me/guilds", session.accessToken);
        } catch {
          json(res, 401, { error: "discord_session_expired" });
          return;
        }
        const guild = guilds.find((item) => item.id === identity.externalId);
        const permissions = guild ? discordGuildPermissions(guild) : 0n;
        const canManage = Boolean(guild && (guild.owner ||
          (permissions & 0x8n) === 0x8n ||
          (permissions & 0x20n) === 0x20n));
        if (!canManage) {
          json(res, 403, { error: "community_management_forbidden" });
          return;
        }
      }

      const now = Date.now();
      const pending = database.getRuntimeState<Array<{
        code: string; chatId: string; chatTitle: string; requestedBy: string;
        createdAt: string; expiresAt: string;
      }>>("telegram.pending_group_links") ?? [];
      const claim = pending.find((item) => item.code === code && Date.parse(item.expiresAt) > now);
      if (!claim) {
        json(res, 404, { error: "link_code_not_found_or_expired" });
        return;
      }
      const existing = database.getCommunityIdentitiesSnapshot()
        .find((item) => item.platform === "telegram" && item.externalId === claim.chatId);
      if (existing && existing.communityId !== communityId) {
        const linkedCommunity = database.getCommunitiesSnapshot().find((item) => item.id === existing.communityId);
        json(res, 409, {
          error: "telegram_group_already_linked",
          linkedCommunityId: existing.communityId,
          linkedCommunityName: linkedCommunity?.name ?? existing.communityId
        });
        return;
      }

      const timestamp = new Date();
      database.upsertCommunityIdentity({
        id: existing?.id ?? `community-identity-${randomUUID()}`,
        communityId,
        platform: "telegram",
        externalId: claim.chatId,
        name: claim.chatTitle,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp
      });
      // Register the group as a Bridge endpoint immediately so the owner
      // does not have to re-enter its platform IDs by hand.
      database.upsertBridgeEndpoint({
        id: `telegram:${claim.chatId}:${claim.chatId}`,
        platform: "telegram",
        communityExternalId: claim.chatId,
        communityName: claim.chatTitle,
        channelExternalId: claim.chatId,
        channelName: claim.chatTitle,
        communityId,
        channelId: claim.chatId,
        updatedAt: timestamp
      });
      database.setRuntimeState("telegram.pending_group_links", pending.filter((item) => item.code !== code));
      json(res, 200, {
        linked: true,
        communityId,
        telegram: { chatId: claim.chatId, chatTitle: claim.chatTitle }
      });
      return;
    }

    if (url.pathname === "/api/auth" && req.method === "DELETE") {
      const session = ownerSession(req);
      if (session) {
        ownerSessions.delete(session.id);
        persistOwnerSessions();
      }
      res.writeHead(204, { "set-cookie": clearOwnerCookies(req) });
      res.end();
      return;
    }

    if (!dashboardAuthorized(req)) {
      json(res, 401, { error: "unauthorized" });
      return;
    }

    // Discord OAuth sessions may read community-scoped data only for a
    // Discord guild they can manage. API-key sessions remain the installation
    // owner's trusted access path.
    if (req.method === "GET" && !authorized(req)) {
      const communityPath = url.pathname.match(new RegExp("^/api/communities/([^/]+)"));
      const communityId = communityPath?.[1] ?? url.searchParams.get("communityId") ?? "";
      if (communityId) {
        const session = discordSession(req);
        const identity = database.getCommunityIdentitiesSnapshot(communityId)
          .find((item) => item.platform === "discord");
        if (!session || !identity) {
          json(res, 403, { error: "community_read_forbidden" });
          return;
        }
        let guilds: DiscordGuild[];
        try {
          guilds = await discordApi<DiscordGuild[]>("/users/@me/guilds", session.accessToken);
        } catch {
          json(res, 401, { error: "discord_session_expired" });
          return;
        }
        const guild = guilds.find((item) => item.id === identity.externalId);
        const permissions = guild ? discordGuildPermissions(guild) : 0n;
        const canManage = Boolean(guild && (guild.owner ||
          (permissions & 0x8n) === 0x8n ||
          (permissions & 0x20n) === 0x20n));
        if (!canManage) {
          json(res, 403, { error: "community_read_forbidden" });
          return;
        }
      }
    }

    // Owner-only control plane. OAuth proves a Discord identity, not ownership
    // of this Modexa installation. Never expose process controls or diagnostics
    // to ordinary community managers, even for read-only requests.
    const ownerOnlyPath =
      url.pathname === "/api/system" ||
      url.pathname === "/api/runtime" ||
      url.pathname === "/api/runtime/logs" ||
      url.pathname === "/api/backup" ||
      url.pathname === "/api/bridge" ||
      url.pathname === "/api/telegram/groups/pending" ||
      url.pathname === "/api/actions" ||
      url.pathname.startsWith("/api/actions/");
    if (ownerOnlyPath && !authorized(req)) {
      json(res, 403, { error: "owner_api_key_required" });
      return;
    }

    // Every community-scoped read is checked on the server too. Hiding a
    // community in the selector is not an authorization boundary.
    if (isCommunityScopedReadPath(url.pathname, req.method ?? "") && !authorized(req)) {
      let communityId = url.searchParams.get("communityId") ?? "";
      const communityPath = url.pathname.match(/^\/api\/communities\/([^/]+)/);
      if (communityPath) {
        try { communityId = decodeURIComponent(communityPath[1]!); } catch { communityId = ""; }
      }
      if (!communityId) {
        json(res, 400, { error: "communityId_required" });
        return;
      }
      if (!await canManageDiscordCommunity(req, communityId)) {
        json(res, 403, { error: "community_management_forbidden" });
        return;
      }
    }

    // Community mutations are allowed for Discord users only when the target
    // community is linked to a guild they can manage. Owner API-key sessions
    // remain the separate installation-wide control plane.
    const isCommunityScopedMutation = isCommunityScopedMutationPath(url.pathname, req.method ?? "");
    if (isCommunityScopedMutation && !authorized(req)) {
      let body: Record<string, unknown>;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        json(res, 400, { error: error instanceof Error ? error.message : "invalid_request_body" });
        return;
      }

      let communityId = typeof body.communityId === "string" ? body.communityId : "";
      const communityPath = url.pathname.match(/^\/api\/communities\/([^/]+)/);
      if (communityPath) {
        // The route's community is authoritative; never trust a body override.
        try { communityId = decodeURIComponent(communityPath[1]!); } catch { communityId = ""; }
      }

      const automationMatch = url.pathname.match(/^\/api\/automations\/([^/]+)$/);
      if (automationMatch) {
        const id = decodeURIComponent(automationMatch[1]!);
        const automation = runtimeServices.automationService.list().find((item) => item.id === id);
        communityId = automation?.communityId ?? "";
      }

      const customCommandMatch = url.pathname.match(/^\/api\/custom-commands\/([^/]+)$/);
      if (customCommandMatch) {
        const id = decodeURIComponent(customCommandMatch[1]!);
        const commands = database.getRuntimeState<Array<Record<string, unknown>>>("api.custom_commands") ?? [];
        const command = commands.find((item) => item.id === id);
        communityId = typeof command?.communityId === "string" ? command.communityId : "";
      }

      if (url.pathname === "/api/moderation/revoke") {
        const caseId = typeof body.caseId === "string" ? body.caseId : "";
        const moderationCase = database.getAllModerationCases().find((item) => item.id === caseId);
        communityId = moderationCase?.communityId ?? "";
      }

      if (!communityId) {
        json(res, 400, { error: "communityId_required" });
        return;
      }
      if (!database.getCommunitiesSnapshot().some((item) => item.id === communityId)) {
        json(res, 404, { error: "community_not_found" });
        return;
      }
      if (!await canManageDiscordCommunity(req, communityId)) {
        json(res, 403, { error: "community_management_forbidden" });
        return;
      }
    }

    // These existing routes perform their own scoped permission checks.
    const isCommunityModeMutation = url.pathname === "/api/community/mode" && req.method === "POST";
    const isCommunitySettingsMutation = /^\/api\/communities\/[^/]+\/settings$/.test(url.pathname) && req.method === "PATCH";
    const isCommandSettingsMutation = url.pathname === "/api/command-settings" && req.method === "POST";
    const isTelegramGroupLinkMutation = url.pathname === "/api/telegram/groups/link" && req.method === "POST";
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method ?? "") && !authorized(req) && !isCommunityScopedMutation && !isCommunityModeMutation && !isCommunitySettingsMutation && !isCommandSettingsMutation && !isTelegramGroupLinkMutation) {
      json(res, 403, { error: "api_key_required_for_mutations" });
      return;
    }

    if (url.pathname === "/api/runtime/logs" && req.method === "GET") {
      const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100));
      const stream = url.searchParams.get("stream");
      if (stream && stream !== "stdout" && stream !== "stderr") { json(res, 400, { error: "stream_must_be_stdout_or_stderr" }); return; }
      const items = runnerLogs.filter((item) => !stream || item.stream === stream).slice(-limit);
      json(res, 200, { items, totalBuffered: runnerLogs.length, limit });
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

      if (!authorized(req)) {
        const session = discordSession(req);
        const identity = database.getCommunityIdentitiesSnapshot(communityId)
          .find((item) => item.platform === "discord");
        if (!session || !identity) {
          json(res, 403, { error: "community_management_forbidden" });
          return;
        }
        let guilds: DiscordGuild[];
        try {
          guilds = await discordApi<DiscordGuild[]>("/users/@me/guilds", session.accessToken);
        } catch {
          json(res, 401, { error: "discord_session_expired" });
          return;
        }
        const guild = guilds.find((item) => item.id === identity.externalId);
        const permissions = guild ? discordGuildPermissions(guild) : 0n;
        const canManage = Boolean(guild && (guild.owner ||
          (permissions & 0x8n) === 0x8n ||
          (permissions & 0x20n) === 0x20n));
        if (!canManage) {
          json(res, 403, { error: "community_management_forbidden" });
          return;
        }
      }

      database.upsertCommunity({ ...community, mode, updatedAt: new Date() });
      json(res, 200, { updated: true, communityId, mode });
      return;
    }

    if (url.pathname === "/api/overview" && req.method === "GET") {
      let communities = database.getCommunitiesSnapshot();
      let cases = database.getAllModerationCases();

      if (!authorized(req)) {
        const session = discordSession(req);
        if (!session) { json(res, 401, { error: "unauthorized" }); return; }
        let guilds: DiscordGuild[];
        try {
          guilds = await discordApi<DiscordGuild[]>("/users/@me/guilds", session.accessToken);
        } catch {
          json(res, 401, { error: "discord_session_expired" }); return;
        }
        const manageableGuildIds = new Set(guilds.filter((guild) => {
          const permissions = discordGuildPermissions(guild);
          return guild.owner || (permissions & 0x8n) === 0x8n || (permissions & 0x20n) === 0x20n;
        }).map((guild) => guild.id));
        const allowedCommunityIds = new Set(database.getCommunityIdentitiesSnapshot()
          .filter((identity) => identity.platform === "discord" && manageableGuildIds.has(identity.externalId))
          .map((identity) => identity.communityId));
        communities = communities.filter((community) => allowedCommunityIds.has(community.id));
        cases = cases.filter((item) => allowedCommunityIds.has(item.communityId));
      }

      json(res, 200, {
        communities: communities.length,
        activeCommunities: communities.filter((item) => item.mode === "public").length,
        moderationCases: cases.length,
        activeModerationCases: cases.filter((item) => item.status === "active").length,
        updatedAt: new Date().toISOString()
      });
      return;
    }

    if (url.pathname === "/api/analytics" && req.method === "GET") {
      const communityId = url.searchParams.get("communityId") ?? undefined;
      if (!authorized(req) && !communityId) {
        json(res, 400, { error: "communityId_required_for_user_session" });
        return;
      }
      const communities = database.getCommunitiesSnapshot();
      if (communityId && !communities.some((item) => item.id === communityId)) {
        json(res, 404, { error: "community_not_found" });
        return;
      }
      const memberships = database.getMembershipsSnapshot(communityId);
      const cases = (communityId
        ? database.getModerationCases(communityId)
        : database.getAllModerationCases());
      const automations = runtimeServices.automationService.list(communityId);
      const audit = communityId ? database.getAuditEntries(communityId, 500) : [];
      const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
      json(res, 200, {
        generatedAt: new Date().toISOString(),
        periodDays: 7,
        communities: communityId ? 1 : communities.length,
        members: {
          total: memberships.length,
          active: memberships.filter((item) => item.status === "active").length,
          left: memberships.filter((item) => item.status === "left").length,
          banned: memberships.filter((item) => item.status === "banned").length
        },
        moderation: {
          total: cases.length,
          active: cases.filter((item) => item.status === "active").length,
          revoked: cases.filter((item) => item.status === "revoked").length,
          last7Days: cases.filter((item) => item.createdAt.getTime() >= since).length
        },
        automations: {
          total: automations.length,
          enabled: automations.filter((item) => item.enabled).length
        },
        auditEventsLast7Days: audit.filter((item) => item.createdAt.getTime() >= since).length
      });
      return;
    }

    if (url.pathname.startsWith("/api/billing") && !authorized(req)) {
      json(res, 403, { error: "api_key_required_for_billing" }); return;
    }

    if (url.pathname === "/api/billing/plans" && req.method === "GET") {
      json(res, 200, { items: runtimeServices.billingService.getPlans() }); return;
    }

    if (url.pathname === "/api/billing/subscriptions" && ["GET", "POST"].includes(req.method ?? "")) {
      if (req.method === "GET") {
        const communityId = url.searchParams.get("communityId");
        if (communityId) {
          if (!database.getCommunitiesSnapshot().some((item) => item.id === communityId)) { json(res, 404, { error: "community_not_found" }); return; }
          json(res, 200, { item: runtimeServices.billingService.getCommunitySubscription(communityId as never) ?? null }); return;
        }
        const state = database.getRuntimeState<{ subscriptions?: unknown[] }>("billing");
        json(res, 200, { items: state?.subscriptions ?? [] }); return;
      }
      const body = await readJsonBody(req);
      const communityId = typeof body.communityId === "string" ? body.communityId : "";
      const planId = typeof body.planId === "string" ? body.planId : "";
      if (!communityId || !planId || !database.getCommunitiesSnapshot().some((item) => item.id === communityId)) {
        json(res, 400, { error: "communityId_and_planId_required" }); return;
      }
      try {
        const expiresAt = typeof body.expiresAt === "string" ? new Date(body.expiresAt) : undefined;
        if (expiresAt && !Number.isFinite(expiresAt.getTime())) { json(res, 400, { error: "invalid_expiresAt" }); return; }
        const item = runtimeServices.billingService.createSubscription({
          communityId: communityId as never,
          planId,
          ...(expiresAt ? { expiresAt } : {})
        });
        json(res, 201, { item }); return;
      } catch (error) {
        json(res, 409, { error: error instanceof Error ? error.message : "subscription_create_failed" }); return;
      }
    }

    const subscriptionMatch = url.pathname.match(/^\/api\/billing\/subscriptions\/([^/]+)$/);
    if (subscriptionMatch && ["PATCH", "DELETE"].includes(req.method ?? "")) {
      const id = decodeURIComponent(subscriptionMatch[1]!);
      try {
        if (req.method === "DELETE") {
          json(res, 200, { item: runtimeServices.billingService.cancelSubscription(id as never) }); return;
        }
        const body = await readJsonBody(req);
        if (typeof body.planId === "string") {
          json(res, 200, { item: runtimeServices.billingService.changePlan(id as never, body.planId) }); return;
        }
        json(res, 400, { error: "planId_required" }); return;
      } catch (error) {
        json(res, 404, { error: error instanceof Error ? error.message : "subscription_update_failed" }); return;
      }
    }

    const subscriptionOverrideMatch = url.pathname.match(/^\/api\/billing\/subscriptions\/([^/]+)\/features\/([^/]+)$/);
    if (subscriptionOverrideMatch && ["PUT", "DELETE"].includes(req.method ?? "")) {
      const subscriptionId = decodeURIComponent(subscriptionOverrideMatch[1]!);
      const feature = decodeURIComponent(subscriptionOverrideMatch[2]!);
      const allowedFeatures = new Set(["basic_commands", "basic_moderation", "advanced_moderation", "automod", "bridge", "automations", "analytics", "backup"]);
      if (!allowedFeatures.has(feature)) { json(res, 400, { error: "unknown_feature" }); return; }
      if (req.method === "DELETE") {
        runtimeServices.billingService.clearFeatureOverride(subscriptionId as never, feature as never);
        json(res, 200, { cleared: true, subscriptionId, feature }); return;
      }
      const body = await readJsonBody(req);
      if (typeof body.enabled !== "boolean" || (body.limit !== undefined && (!Number.isInteger(body.limit) || Number(body.limit) < 0))) {
        json(res, 400, { error: "invalid_feature_override" }); return;
      }
      try {
        const item = runtimeServices.billingService.setFeatureOverride({ subscriptionId: subscriptionId as never, feature: feature as never, enabled: body.enabled, ...(typeof body.limit === "number" ? { limit: body.limit } : {}) });
        json(res, 200, { item }); return;
      } catch (error) {
        json(res, 404, { error: error instanceof Error ? error.message : "feature_override_failed" }); return;
      }
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
      if (!authorized(req) && !communityId) {
        json(res, 400, { error: "communityId_required_for_user_session" });
        return;
      }
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

    if (url.pathname === "/api/bridge/endpoints" && req.method === "POST") {
      const body = await readJsonBody(req);
      const required = ["platform", "communityExternalId", "communityName", "channelExternalId", "channelName"];
      if (required.some((key) => typeof body[key] !== "string" || !(body[key] as string).trim()) ||
          !["telegram", "discord"].includes(String(body.platform))) {
        json(res, 400, { error: "invalid_bridge_endpoint" });
        return;
      }
      const endpoint = {
        id: typeof body.id === "string" && body.id.trim() ? body.id : `endpoint-${randomUUID()}`,
        platform: body.platform as "telegram" | "discord",
        communityExternalId: (body.communityExternalId as string).trim(),
        communityName: (body.communityName as string).trim(),
        channelExternalId: (body.channelExternalId as string).trim(),
        channelName: (body.channelName as string).trim(),
        ...(typeof body.communityId === "string" ? { communityId: body.communityId } : {}),
        ...(typeof body.channelId === "string" ? { channelId: body.channelId } : {}),
        updatedAt: new Date()
      };
      database.upsertBridgeEndpoint(endpoint);
      json(res, 201, { item: endpoint });
      return;
    }

    const bridgeEndpointMatch = url.pathname.match(/^\/api\/bridge\/endpoints\/([^/]+)$/);
    if (bridgeEndpointMatch && ["PUT", "DELETE"].includes(req.method ?? "")) {
      const id = decodeURIComponent(bridgeEndpointMatch[1]!);
      const existing = database.getBridgeEndpoints().find((item) => item.id === id);
      if (!existing) { json(res, 404, { error: "bridge_endpoint_not_found" }); return; }
      if (req.method === "DELETE") {
        database.deleteBridgeEndpoint(id);
        json(res, 200, { deleted: true, id }); return;
      }
      const body = await readJsonBody(req);
      const platform = body.platform ?? existing.platform;
      const communityExternalId = body.communityExternalId ?? existing.communityExternalId;
      const communityName = body.communityName ?? existing.communityName;
      const channelExternalId = body.channelExternalId ?? existing.channelExternalId;
      const channelName = body.channelName ?? existing.channelName;
      if (!["telegram", "discord"].includes(String(platform)) ||
          [communityExternalId, communityName, channelExternalId, channelName].some((value) => typeof value !== "string" || !value.trim())) {
        json(res, 400, { error: "invalid_bridge_endpoint" }); return;
      }
      const updated = {
        ...existing,
        platform: platform as "telegram" | "discord",
        communityExternalId: String(communityExternalId).trim(),
        communityName: String(communityName).trim(),
        channelExternalId: String(channelExternalId).trim(),
        channelName: String(channelName).trim(),
        ...(typeof body.communityId === "string" ? { communityId: body.communityId } : {}),
        ...(typeof body.channelId === "string" ? { channelId: body.channelId } : {}),
        updatedAt: new Date()
      };
      database.upsertBridgeEndpoint(updated);
      json(res, 200, { item: updated }); return;
    }

    if (url.pathname === "/api/bridge/links" && req.method === "POST") {
      const body = await readJsonBody(req);
      const sourceEndpointId = typeof body.sourceEndpointId === "string" ? body.sourceEndpointId : "";
      const targetEndpointId = typeof body.targetEndpointId === "string" ? body.targetEndpointId : "";
      const endpoints = database.getBridgeEndpoints();
      if (!sourceEndpointId || !targetEndpointId || sourceEndpointId === targetEndpointId ||
          !endpoints.some((item) => item.id === sourceEndpointId) ||
          !endpoints.some((item) => item.id === targetEndpointId)) {
        json(res, 400, { error: "invalid_bridge_link_endpoints" });
        return;
      }
      const existing = database.getBridgeLinks().find((item) =>
        item.sourceEndpointId === sourceEndpointId && item.targetEndpointId === targetEndpointId
      );
      if (existing) { json(res, 200, { item: existing, existing: true }); return; }
      const now = new Date();
      const link = { id: `bridge-${randomUUID()}`, sourceEndpointId, targetEndpointId, createdAt: now, updatedAt: now };
      try {
        database.upsertBridgeLink(link);
        json(res, 201, { item: link });
      } catch {
        json(res, 400, { error: "bridge_link_create_failed" });
      }
      return;
    }

    const bridgeLinkMatch = url.pathname.match(/^\/api\/bridge\/links\/([^/]+)$/);
    if (bridgeLinkMatch && req.method === "DELETE") {
      const id = decodeURIComponent(bridgeLinkMatch[1]!);
      const exists = database.getBridgeLinks().some((item) => item.id === id);
      if (!exists) { json(res, 404, { error: "bridge_link_not_found" }); return; }
      database.deleteBridgeLink(id);
      json(res, 200, { deleted: true, id });
      return;
    }

    const automodRulesMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/automod\/rules$/);
    if (automodRulesMatch && ["GET", "POST"].includes(req.method ?? "")) {
      const communityId = decodeURIComponent(automodRulesMatch[1]!);
      if (!database.getCommunitiesSnapshot().some((item) => item.id === communityId)) { json(res, 404, { error: "community_not_found" }); return; }
      if (req.method === "GET") { json(res, 200, { items: runtimeServices.autoModService.listRules(communityId) }); return; }
      const body = await readJsonBody(req);
      const types = new Set(["keyword", "link", "invite", "scam", "caps", "flood", "repeated_text", "emotes", "mentions", "zalgo"]);
      const actions = new Set(["warn", "mute", "kick", "ban", "delete"]);
      if (typeof body.type !== "string" || !types.has(body.type) || typeof body.enabled !== "boolean" ||
          typeof body.action !== "string" || !actions.has(body.action) ||
          (body.value !== undefined && (typeof body.value !== "string" || body.value.length > 500)) ||
          (body.threshold !== undefined && (!Number.isFinite(body.threshold) || Number(body.threshold) < 0 || Number(body.threshold) > 1)) ||
          (body.windowSeconds !== undefined && (!Number.isInteger(body.windowSeconds) || Number(body.windowSeconds) < 1 || Number(body.windowSeconds) > 86400)) ||
          (body.whitelist !== undefined && (!Array.isArray(body.whitelist) || !body.whitelist.every((v) => typeof v === "string" && v.length <= 300)))) {
        json(res, 400, { error: "invalid_automod_rule" }); return;
      }
      const all = database.getRuntimeState<Array<Record<string, unknown>>>("api.automod_rules") ?? [];
      const item = {
        id: typeof body.id === "string" && body.id.trim() ? body.id : `automod-${randomUUID()}`,
        communityId,
        type: body.type,
        enabled: body.enabled,
        ...(typeof body.value === "string" ? { value: body.value } : {}),
        ...(typeof body.threshold === "number" ? { threshold: body.threshold } : {}),
        ...(typeof body.windowSeconds === "number" ? { windowSeconds: body.windowSeconds } : {}),
        ...(Array.isArray(body.whitelist) ? { whitelist: body.whitelist } : {}),
        action: body.action
      };
      const existing = all.findIndex((rule) => rule.id === item.id);
      if (existing >= 0) all[existing] = item; else all.push(item);
      database.setRuntimeState("api.automod_rules", all);
      runtimeServices.autoModService.upsertRule(item as never);
      json(res, existing >= 0 ? 200 : 201, { item }); return;
    }

    const automodRuleMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/automod\/rules\/([^/]+)$/);
    if (automodRuleMatch && req.method === "DELETE") {
      const communityId = decodeURIComponent(automodRuleMatch[1]!);
      const ruleId = decodeURIComponent(automodRuleMatch[2]!);
      const all = database.getRuntimeState<Array<Record<string, unknown>>>("api.automod_rules") ?? [];
      const item = all.find((rule) => rule.id === ruleId && rule.communityId === communityId);
      if (!item) { json(res, 404, { error: "automod_rule_not_found" }); return; }
      database.setRuntimeState("api.automod_rules", all.filter((rule) => rule.id !== ruleId));
      runtimeServices.autoModService.removeRule(ruleId);
      json(res, 200, { deleted: true, id: ruleId }); return;
    }

    const rankingSettingsMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/ranking$/);
    if (rankingSettingsMatch && ["GET", "PUT", "PATCH"].includes(req.method ?? "")) {
      const communityId = decodeURIComponent(rankingSettingsMatch[1]!);
      if (!database.getCommunitiesSnapshot().some((item) => item.id === communityId)) { json(res, 404, { error: "community_not_found" }); return; }
      const key = `api.ranking.${communityId}`;
      const defaults = { enabled: false, textXp: 10, voiceXpPerMinute: 5, cooldownSeconds: 60, ignoredRoleIds: [] as string[], ignoredChannelIds: [] as string[], rewards: [] as Array<{level:number;roleId:string}> };
      const current = { ...defaults, ...(database.getRuntimeState<typeof defaults>(key) ?? {}) };
      if (req.method === "GET") { json(res, 200, { item: current }); return; }
      const body = await readJsonBody(req);
      const next = { ...current, ...body };
      if (typeof next.enabled !== "boolean" || !Number.isFinite(next.textXp) || Number(next.textXp) < 0 ||
          !Number.isFinite(next.voiceXpPerMinute) || Number(next.voiceXpPerMinute) < 0 ||
          !Number.isInteger(next.cooldownSeconds) || Number(next.cooldownSeconds) < 0 ||
          !Array.isArray(next.ignoredRoleIds) || !next.ignoredRoleIds.every((v) => typeof v === "string") ||
          !Array.isArray(next.ignoredChannelIds) || !next.ignoredChannelIds.every((v) => typeof v === "string") ||
          !Array.isArray(next.rewards) || !next.rewards.every((v) => v && Number.isInteger(v.level) && v.level >= 0 && typeof v.roleId === "string")) {
        json(res, 400, { error: "invalid_ranking_settings" }); return;
      }
      database.setRuntimeState(key, next);
      runtimeServices.rankingService.setSettings(communityId, next as never);
      json(res, 200, { updated: true, item: next }); return;
    }

    const rankingLeaderboardMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/ranking\/leaderboard$/);
    if (rankingLeaderboardMatch && req.method === "GET") {
      const communityId = decodeURIComponent(rankingLeaderboardMatch[1]!);
      if (!database.getCommunitiesSnapshot().some((item) => item.id === communityId)) { json(res, 404, { error: "community_not_found" }); return; }
      const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "10", 10) || 10));
      json(res, 200, { items: runtimeServices.rankingService.leaders(communityId, limit) }); return;
    }

    const rankingMemberMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/ranking\/members\/([^/]+)$/);
    if (rankingMemberMatch && req.method === "GET") {
      const communityId = decodeURIComponent(rankingMemberMatch[1]!);
      const userId = decodeURIComponent(rankingMemberMatch[2]!);
      const item = runtimeServices.rankingService.getMember(communityId, userId);
      if (!item) { json(res, 404, { error: "ranking_member_not_found" }); return; }
      json(res, 200, { item }); return;
    }

    const rankingCookiesMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/ranking\/cookies$/);
    if (rankingCookiesMatch && req.method === "POST") {
      const communityId = decodeURIComponent(rankingCookiesMatch[1]!);
      const body = await readJsonBody(req);
      const userId = typeof body.userId === "string" ? body.userId : "";
      const amount = body.amount === undefined ? 1 : body.amount;
      if (!userId || !database.getUser(userId) || !Number.isInteger(amount) || Math.abs(Number(amount)) > 10000) {
        json(res, 400, { error: "invalid_cookie_adjustment" }); return;
      }
      json(res, 200, { item: runtimeServices.rankingService.addCookies(communityId, userId, Number(amount)) }); return;
    }

    const welcomePreviewMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/welcome\/preview$/);
    if (welcomePreviewMatch && req.method === "POST") {
      const communityId = decodeURIComponent(welcomePreviewMatch[1]!);
      const settings = runtimeServices.welcomeService.getSettings(communityId);
      const body = await readJsonBody(req);
      const variables = {
        member: typeof body.member === "string" ? body.member.slice(0, 100) : "Участник",
        community: database.getCommunitiesSnapshot().find((item) => item.id === communityId)?.name ?? communityId,
        username: typeof body.username === "string" ? body.username.slice(0, 100) : ""
      };
      json(res, 200, {
        welcome: runtimeServices.welcomeService.render(settings.message, variables),
        leave: runtimeServices.welcomeService.render(settings.leaveMessage, variables)
      }); return;
    }

    const welcomeSettingsMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/welcome$/);
    if (welcomeSettingsMatch && ["GET", "PUT", "PATCH"].includes(req.method ?? "")) {
      const communityId = decodeURIComponent(welcomeSettingsMatch[1]!);
      if (!database.getCommunitiesSnapshot().some((item) => item.id === communityId)) { json(res, 404, { error: "community_not_found" }); return; }
      const key = `api.welcome.${communityId}`;
      const defaults = { enabled: false, message: "Добро пожаловать, {{ member }}!", leaveEnabled: false, leaveMessage: "{{ member }} покинул сервер.", startingRoleIds: [] as string[], restoreRolesOnRejoin: true, restoreNicknameOnRejoin: true, channelId: undefined as string | undefined };
      const current = { ...defaults, ...(database.getRuntimeState<typeof defaults>(key) ?? {}) };
      if (req.method === "GET") { json(res, 200, { item: current }); return; }
      const body = await readJsonBody(req);
      const next = { ...current, ...body };
      if (typeof next.enabled !== "boolean" || typeof next.leaveEnabled !== "boolean" ||
          typeof next.message !== "string" || next.message.length > 4000 ||
          typeof next.leaveMessage !== "string" || next.leaveMessage.length > 4000 ||
          typeof next.restoreRolesOnRejoin !== "boolean" || typeof next.restoreNicknameOnRejoin !== "boolean" ||
          !Array.isArray(next.startingRoleIds) || !next.startingRoleIds.every((v) => typeof v === "string") ||
          (next.channelId !== undefined && typeof next.channelId !== "string")) {
        json(res, 400, { error: "invalid_welcome_settings" }); return;
      }
      database.setRuntimeState(key, next);
      runtimeServices.welcomeService.setSettings(communityId, next as never);
      json(res, 200, { updated: true, item: next }); return;
    }

    if (url.pathname === "/api/custom-commands" && ["GET", "POST"].includes(req.method ?? "")) {
      const communityId = url.searchParams.get("communityId");
      if (req.method === "GET") {
        if (!communityId) { json(res, 400, { error: "communityId_required" }); return; }
        const all = database.getRuntimeState<Array<Record<string, unknown>>>("api.custom_commands") ?? [];
        json(res, 200, { items: all.filter((item) => item.communityId === communityId) }); return;
      }
      const body = await readJsonBody(req);
      const targetCommunityId = typeof body.communityId === "string" ? body.communityId : "";
      const name = typeof body.name === "string" ? body.name.trim().replace(/^\//, "") : "";
      if (!targetCommunityId || !database.getCommunitiesSnapshot().some((item) => item.id === targetCommunityId) ||
          !/^[a-zA-Z0-9_-]{1,32}$/.test(name) || !Array.isArray(body.actions) || body.actions.length < 1 || body.actions.length > 20) {
        json(res, 400, { error: "invalid_custom_command" }); return;
      }
      const aliases: unknown = body.aliases === undefined ? [] : body.aliases;
      const accessValue: unknown = body.access === undefined ? { roleIds: [], channelIds: [], cooldownSeconds: 0 } : body.access;
      const validAction = (value: unknown): boolean => {
        if (!value || typeof value !== "object") return false;
        const action = value as Record<string, unknown>;
        return (action.type === "message" && typeof action.content === "string" && action.content.length <= 4000) ||
          (action.type === "alias" && typeof action.command === "string" && action.command.length <= 64) ||
          ((action.type === "role.add" || action.type === "role.remove") && typeof action.roleId === "string");
      };
      if (!Array.isArray(aliases) || !aliases.every((v) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(v)) ||
          !accessValue || typeof accessValue !== "object") {
        json(res, 400, { error: "invalid_custom_command_definition" }); return;
      }
      const access = accessValue as Record<string, unknown>;
      if (!Array.isArray(access.roleIds) || !Array.isArray(access.channelIds) ||
          !Number.isInteger(access.cooldownSeconds) || Number(access.cooldownSeconds) < 0 || Number(access.cooldownSeconds) > 86400 ||
          !access.roleIds.every((v: unknown) => typeof v === "string") || !access.channelIds.every((v: unknown) => typeof v === "string") ||
          !body.actions.every(validAction)) {
        json(res, 400, { error: "invalid_custom_command_definition" }); return;
      }
      const all = database.getRuntimeState<Array<Record<string, unknown>>>("api.custom_commands") ?? [];
      if (all.some((item) => item.communityId === targetCommunityId && String(item.name).toLowerCase() === name.toLowerCase())) {
        json(res, 409, { error: "custom_command_name_exists" }); return;
      }
      const item = { id: `custom-${randomUUID()}`, communityId: targetCommunityId, name, description: typeof body.description === "string" ? body.description.slice(0, 300) : undefined, group: typeof body.group === "string" ? body.group.slice(0, 80) : undefined, enabled: body.enabled !== false, aliases: aliases as string[], access: access as { roleIds: string[]; channelIds: string[]; cooldownSeconds: number }, actions: body.actions, updatedAt: new Date().toISOString(), updatedBy: typeof body.updatedBy === "string" ? body.updatedBy : undefined };
      database.setRuntimeState("api.custom_commands", [...all, item]);
      runtimeServices.customCommandService.upsert(item as never);
      json(res, 201, { item }); return;
    }

    const customCommandMatch = url.pathname.match(/^\/api\/custom-commands\/([^/]+)$/);
    if (customCommandMatch && ["PUT", "PATCH", "DELETE"].includes(req.method ?? "")) {
      const id = decodeURIComponent(customCommandMatch[1]!);
      const all = database.getRuntimeState<Array<Record<string, any>>>("api.custom_commands") ?? [];
      const index = all.findIndex((item) => item.id === id);
      if (index < 0) { json(res, 404, { error: "custom_command_not_found" }); return; }
      if (req.method === "DELETE") {
        database.setRuntimeState("api.custom_commands", all.filter((item) => item.id !== id));
        runtimeServices.customCommandService.remove(id);
        json(res, 200, { deleted: true, id }); return;
      }
      const body = await readJsonBody(req);
      const current = all[index]!;
      const next: Record<string, any> = { ...current, ...body, id: current.id, communityId: current.communityId, updatedAt: new Date().toISOString() };
      if (typeof next.name !== "string" || !/^[a-zA-Z0-9_-]{1,32}$/.test(next.name.replace(/^\//, "")) ||
          typeof next.enabled !== "boolean" || !Array.isArray(next.aliases) || !Array.isArray(next.actions) ||
          next.actions.length < 1 || next.actions.length > 20) {
        json(res, 400, { error: "invalid_custom_command_update" }); return;
      }
      next.name = next.name.replace(/^\//, "");
      all[index] = next;
      database.setRuntimeState("api.custom_commands", all);
      runtimeServices.customCommandService.upsert(next as never);
      json(res, 200, { item: next }); return;
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

    if (url.pathname === "/api/communities" && ["GET", "POST"].includes(req.method ?? "")) {
      if (req.method === "GET") {
        if (authorized(req)) {
          json(res, 200, { items: database.getCommunitiesSnapshot() });
          return;
        }

        const session = discordSession(req);
        if (!session) { json(res, 401, { error: "unauthorized" }); return; }
        let guilds: DiscordGuild[];
        try {
          guilds = await discordApi<DiscordGuild[]>("/users/@me/guilds", session.accessToken);
        } catch {
          json(res, 401, { error: "discord_session_expired" }); return;
        }
        const manageableGuildIds = new Set(guilds.filter((guild) => {
          const permissions = discordGuildPermissions(guild);
          return guild.owner || (permissions & 0x8n) === 0x8n || (permissions & 0x20n) === 0x20n;
        }).map((guild) => guild.id));
        const allowedCommunityIds = new Set(database.getCommunityIdentitiesSnapshot()
          .filter((identity) => identity.platform === "discord" && manageableGuildIds.has(identity.externalId))
          .map((identity) => identity.communityId));
        json(res, 200, { items: database.getCommunitiesSnapshot().filter((community) => allowedCommunityIds.has(community.id)) });
        return;
      }
      const body = await readJsonBody(req);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 120) { json(res, 400, { error: "community_name_required_max_120" }); return; }
      try {
        const item = runtimeServices.communityService.createCommunity({ name });
        if (body.mode === "private") runtimeServices.communityService.setMode(item.id, "private");
        json(res, 201, { item: runtimeServices.communityService.getCommunity(item.id) }); return;
      } catch (error) {
        json(res, 400, { error: error instanceof Error ? error.message : "community_create_failed" }); return;
      }
    }

    const communityIdentityMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/identities$/);
    if (communityIdentityMatch && ["GET", "POST"].includes(req.method ?? "")) {
      const communityId = decodeURIComponent(communityIdentityMatch[1]!);
      if (!database.getCommunitiesSnapshot().some((item) => item.id === communityId)) { json(res, 404, { error: "community_not_found" }); return; }
      if (req.method === "GET") {
        json(res, 200, { items: database.getCommunityIdentitiesSnapshot(communityId) }); return;
      }
      const body = await readJsonBody(req);
      const platform = body.platform;
      const externalId = typeof body.externalId === "string" ? body.externalId.trim() : "";
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : undefined;
      if (!["telegram", "discord"].includes(String(platform)) || !externalId) {
        json(res, 400, { error: "platform_and_externalId_required" }); return;
      }
      try {
        const item = runtimeServices.communityService.attachIdentity({
          communityId: communityId as never,
          platform: platform as "telegram" | "discord",
          externalId,
          ...(name ? { name } : {})
        });
        json(res, 201, { item }); return;
      } catch (error) {
        json(res, 409, { error: error instanceof Error ? error.message : "community_identity_attach_failed" }); return;
      }
    }

    const communityRolesMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/roles$/);
    if (communityRolesMatch && ["GET", "POST"].includes(req.method ?? "")) {
      const communityId = decodeURIComponent(communityRolesMatch[1]!);
      if (!database.getCommunitiesSnapshot().some((item) => item.id === communityId)) {
        json(res, 404, { error: "community_not_found" }); return;
      }
      if (req.method === "GET") {
        json(res, 200, { items: database.getCommunityRoles(communityId) }); return;
      }
      const body = await readJsonBody(req);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const permissions = body.permissions;
      const allowedPermissions = new Set([
        "community.view", "community.manage", "member.view", "member.manage",
        "moderation.view", "moderation.warn", "moderation.mute", "moderation.kick",
        "moderation.ban", "moderation.clear", "commands.use", "commands.manage",
        "bridge.view", "bridge.manage"
      ]);
      if (!name || name.length > 80 || !Array.isArray(permissions) ||
          permissions.some((permission) => typeof permission !== "string" || !allowedPermissions.has(permission))) {
        json(res, 400, { error: "invalid_community_role" }); return;
      }
      const id = typeof body.id === "string" && body.id.trim() ? body.id : `role-${randomUUID()}`;
      if (database.getCommunityRoles(communityId).some((role) => role.name.toLowerCase() === name.toLowerCase() && role.id !== id)) {
        json(res, 409, { error: "role_name_already_exists" }); return;
      }
      const role = { id, communityId, name, permissions: [...new Set(permissions as string[])] as never[] };
      database.upsertCommunityRole(role);
      json(res, 201, { item: role });
      return;
    }

    const communityRoleMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/roles\/([^/]+)$/);
    if (communityRoleMatch && ["PUT", "PATCH", "DELETE"].includes(req.method ?? "")) {
      const communityId = decodeURIComponent(communityRoleMatch[1]!);
      const roleId = decodeURIComponent(communityRoleMatch[2]!);
      const roles = database.getCommunityRoles(communityId);
      const current = roles.find((role) => role.id === roleId);
      if (!current) { json(res, 404, { error: "role_not_found" }); return; }
      if (req.method === "DELETE") {
        database.deleteCommunityRole(roleId);
        json(res, 200, { deleted: true, id: roleId }); return;
      }
      const body = await readJsonBody(req);
      const name = body.name === undefined ? current.name : typeof body.name === "string" ? body.name.trim() : "";
      const permissions = body.permissions === undefined ? current.permissions : body.permissions;
      const allowedPermissions = new Set([
        "community.view", "community.manage", "member.view", "member.manage",
        "moderation.view", "moderation.warn", "moderation.mute", "moderation.kick",
        "moderation.ban", "moderation.clear", "commands.use", "commands.manage",
        "bridge.view", "bridge.manage"
      ]);
      if (!name || name.length > 80 || !Array.isArray(permissions) ||
          permissions.some((permission) => typeof permission !== "string" || !allowedPermissions.has(permission))) {
        json(res, 400, { error: "invalid_community_role" }); return;
      }
      if (roles.some((role) => role.name.toLowerCase() === name.toLowerCase() && role.id !== roleId)) {
        json(res, 409, { error: "role_name_already_exists" }); return;
      }
      const updated = { ...current, name, permissions: [...new Set(permissions as string[])] as never[] };
      database.upsertCommunityRole(updated);
      json(res, 200, { item: updated }); return;
    }

    const communityMemberRolesMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/members\/([^/]+)\/roles$/);
    if (communityMemberRolesMatch && ["GET", "POST", "DELETE"].includes(req.method ?? "")) {
      const communityId = decodeURIComponent(communityMemberRolesMatch[1]!);
      const userId = decodeURIComponent(communityMemberRolesMatch[2]!);
      const community = database.getCommunitiesSnapshot().find((item) => item.id === communityId);
      if (!community) { json(res, 404, { error: "community_not_found" }); return; }
      if (!database.getUser(userId)) { json(res, 404, { error: "user_not_found" }); return; }
      const roles = database.getCommunityRoles(communityId);
      if (req.method === "GET") {
        json(res, 200, { items: database.getUserCommunityRoles(userId, communityId) }); return;
      }
      const body = await readJsonBody(req);
      const roleId = typeof body.roleId === "string" ? body.roleId : "";
      if (!roles.some((role) => role.id === roleId)) { json(res, 400, { error: "role_not_in_community" }); return; }
      if (req.method === "POST") database.assignCommunityRole(userId, roleId);
      else database.revokeCommunityRole(userId, roleId);
      json(res, 200, { updated: true, items: database.getUserCommunityRoles(userId, communityId) }); return;
    }

    const communitySettingsMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/settings$/);
    if (communitySettingsMatch && ["GET", "PATCH"].includes(req.method ?? "")) {
      const communityId = decodeURIComponent(communitySettingsMatch[1]!);
      if (!database.getCommunitiesSnapshot().some((item) => item.id === communityId)) {
        json(res, 404, { error: "community_not_found" });
        return;
      }
      if (req.method === "GET") {
        json(res, 200, { items: database.getCommunitySettings(communityId) });
        return;
      }
      if (req.method === "PATCH" && !authorized(req)) {
        const session = discordSession(req);
        const identity = database.getCommunityIdentitiesSnapshot(communityId)
          .find((item) => item.platform === "discord");
        if (!session || !identity) {
          json(res, 403, { error: "community_management_forbidden" });
          return;
        }
        let guilds: DiscordGuild[];
        try {
          guilds = await discordApi<DiscordGuild[]>("/users/@me/guilds", session.accessToken);
        } catch {
          json(res, 401, { error: "discord_session_expired" });
          return;
        }
        const guild = guilds.find((item) => item.id === identity.externalId);
        const permissions = guild ? discordGuildPermissions(guild) : 0n;
        if (!guild || !(guild.owner || (permissions & 0x8n) === 0x8n || (permissions & 0x20n) === 0x20n)) {
          json(res, 403, { error: "community_management_forbidden" });
          return;
        }
      }
      const body = await readJsonBody(req);
      const allowedKeys = new Set([
        "access.member_profile_visible",
        "members.list_visible",
        "moderation.logging_enabled",
        "automations.enabled"
      ]);
      const entries = Object.entries(body);
      if (!entries.length || entries.some(([key, value]) =>
        !allowedKeys.has(key) || !["true", "false"].includes(String(value))
      )) {
        json(res, 400, { error: "settings_must_contain_supported_boolean_keys" });
        return;
      }
      for (const [key, value] of entries) {
        database.setCommunitySetting(communityId, key, String(value));
      }
      json(res, 200, { updated: true, items: database.getCommunitySettings(communityId) });
      return;
    }

    const communityDetailMatch = url.pathname.match(/^\/api\/communities\/([^/]+)$/);
    if (communityDetailMatch && req.method === "GET") {
      const communityId = decodeURIComponent(communityDetailMatch[1]);
      const community = database.getCommunitiesSnapshot().find((item) => item.id === communityId);
      if (!community) { json(res, 404, { error: "community_not_found" }); return; }
      json(res, 200, {
        item: community,
        identities: database.getCommunityIdentitiesSnapshot(communityId),
        membershipCount: database.getMembershipsSnapshot(communityId).filter((item) => item.status === "active").length
      });
      return;
    }

    const membershipMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/members\/([^/]+)$/);
    if (membershipMatch && req.method === "PATCH") {
      const communityId = decodeURIComponent(membershipMatch[1]!);
      const userId = decodeURIComponent(membershipMatch[2]!);
      const body = await readJsonBody(req);
      const status = body.status;
      if (!["active", "left", "banned"].includes(String(status))) { json(res, 400, { error: "invalid_membership_status" }); return; }
      const current = database.getMembershipsSnapshot(communityId).find((item) => item.userId === userId);
      if (!current) { json(res, 404, { error: "membership_not_found" }); return; }
      const updated = { ...current, status: status as "active" | "left" | "banned", updatedAt: new Date() };
      database.upsertMembership(updated);
      json(res, 200, { item: updated }); return;
    }

    const communityMembersMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/members$/);
    if (communityMembersMatch && req.method === "GET") {
      const communityId = decodeURIComponent(communityMembersMatch[1]);
      const community = database.getCommunitiesSnapshot().find((item) => item.id === communityId);
      if (!community) { json(res, 404, { error: "community_not_found" }); return; }

      const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "25", 10) || 25));
      const status = url.searchParams.get("status");
      const query = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase();
      const memberships = database.getMembershipsSnapshot(communityId)
        .filter((item) => !status || item.status === status)
        .map((membership) => {
          const user = database.getUser(membership.userId);
          const identities = database.getUserIdentities(membership.userId);
          return { ...membership, user: user ? { id: user.id, displayName: user.displayName, createdAt: user.createdAt } : null, identities };
        })
        .filter((item) => !query || [item.user?.displayName, ...item.identities.map((identity) => identity.username), ...item.identities.map((identity) => identity.externalId)]
          .some((value) => typeof value === "string" && value.toLocaleLowerCase().includes(query)))
        .sort((a, b) => a.user?.displayName?.localeCompare(b.user?.displayName ?? "") ?? 0);

      const total = memberships.length;
      json(res, 200, {
        items: memberships.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      });
      return;
    }

    if (url.pathname.includes("/system-roles") && !authorized(req)) {
      json(res, 403, { error: "api_key_required_for_system_roles" }); return;
    }

    const userSystemRolesMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/system-roles$/);
    if (userSystemRolesMatch && ["GET", "POST", "DELETE"].includes(req.method ?? "")) {
      const userId = decodeURIComponent(userSystemRolesMatch[1]!);
      if (!database.getUser(userId)) { json(res, 404, { error: "user_not_found" }); return; }
      if (req.method === "GET") {
        const ids = database.getUserSystemRoleIds(userId);
        json(res, 200, { items: ids.map((id) => database.getSystemRole(id)).filter(Boolean) }); return;
      }
      const body = await readJsonBody(req);
      const roleId = typeof body.roleId === "string" ? body.roleId : "";
      if (!roleId || !database.getSystemRole(roleId)) { json(res, 404, { error: "system_role_not_found" }); return; }
      if (req.method === "POST") database.assignSystemRole(userId, roleId);
      else database.revokeSystemRole(userId, roleId);
      json(res, 200, { updated: true, items: database.getUserSystemRoleIds(userId) }); return;
    }

    const userSettingsMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/settings$/);
    if (userSettingsMatch && ["GET", "PATCH", "PUT"].includes(req.method ?? "")) {
      const userId = decodeURIComponent(userSettingsMatch[1]!);
      if (!database.getUser(userId)) { json(res, 404, { error: "user_not_found" }); return; }
      if (req.method === "GET") { json(res, 200, { items: database.getUserSettings(userId) }); return; }
      const body = await readJsonBody(req);
      const allowed = new Set(["locale", "notifications.enabled", "profile.visible"]);
      const entries = Object.entries(body);
      if (!entries.length || entries.some(([key, value]) => !allowed.has(key) || !(typeof value === "string" || typeof value === "boolean"))) {
        json(res, 400, { error: "invalid_user_settings" }); return;
      }
      for (const [key, value] of entries) {
        const normalized = String(value);
        if (key === "locale" && !["ru", "en"].includes(normalized)) { json(res, 400, { error: "locale_must_be_ru_or_en" }); return; }
        if ((key === "notifications.enabled" || key === "profile.visible") && !["true", "false"].includes(normalized)) {
          json(res, 400, { error: "boolean_setting_expected" }); return;
        }
      }
      for (const [key, value] of entries) database.setUserSetting(userId, key, String(value));
      json(res, 200, { updated: true, items: database.getUserSettings(userId) }); return;
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

      if (!communityId || !database.getCommunitiesSnapshot().some((item) => item.id === communityId) ||
          !name.trim() || name.length > 120 || !isAutomationTrigger(trigger) || !isAutomationAction(action)) {
        json(res, 400, { error: "invalid_automation_definition" });
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

    const automationMatch = url.pathname.match(/^\/api\/automations\/([^/]+)$/);
    if (automationMatch && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method ?? "")) {
      const id = decodeURIComponent(automationMatch[1]!);
      if (req.method === "DELETE") {
        try {
          runtimeServices.automationService.delete(id);
          json(res, 200, { deleted: true, id });
        } catch {
          json(res, 404, { error: "automation_not_found" });
        }
        return;
      }

      const body = await readJsonBody(req);
      try {
        if (req.method === "POST") {
          if (typeof body.enabled !== "boolean") {
            json(res, 400, { error: "enabled_must_be_boolean" });
            return;
          }
          json(res, 200, runtimeServices.automationService.setEnabled(id, body.enabled));
          return;
        }
        if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
          json(res, 400, { error: "name_must_be_non_empty_string" });
          return;
        }
        if (body.trigger !== undefined && !isAutomationTrigger(body.trigger)) {
          json(res, 400, { error: "invalid_automation_trigger" }); return;
        }
        if (body.action !== undefined && !isAutomationAction(body.action)) {
          json(res, 400, { error: "invalid_automation_action" }); return;
        }
        json(res, 200, runtimeServices.automationService.update(id, {
          ...(typeof body.name === "string" ? { name: body.name } : {}),
          ...(body.trigger !== undefined ? { trigger: body.trigger as never } : {}),
          ...(body.action !== undefined ? { action: body.action as never } : {})
        }));
      } catch (error) {
        json(res, 404, { error: error instanceof Error ? error.message : "automation_update_failed" });
      }
      return;
    }

    if (url.pathname === "/api/command-settings" && req.method === "PUT") {
      const body = await readJsonBody(req);
      const communityId = typeof body.communityId === "string" ? body.communityId : "";
      const items = body.items;
      if (!communityId || !database.getCommunitiesSnapshot().some((item) => item.id === communityId) ||
          !Array.isArray(items) || items.length < 1 || items.length > 200 ||
          !items.every((item) => item && typeof item.commandName === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(item.commandName) && typeof item.enabled === "boolean")) {
        json(res, 400, { error: "invalid_command_settings_batch" }); return;
      }
      for (const item of items) database.setCommandEnabled(communityId, item.commandName, item.enabled);
      json(res, 200, { updated: items.length, items: database.getCommandSettings(communityId) }); return;
    }

    if (url.pathname === "/api/command-settings" && req.method === "POST") {
      const body = await readJsonBody(req);
      const communityId = typeof body.communityId === "string" ? body.communityId : "";
      const commandName = typeof body.commandName === "string" ? body.commandName : "";
      const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;
      if (!authorized(req)) {
        const session = discordSession(req);
        const identities = communityId ? database.getCommunityIdentitiesSnapshot(communityId).filter((identity) => identity.platform === "discord") : [];
        if (!session || !communityId || identities.length === 0) {
          json(res, 403, { error: "community_management_forbidden" });
          return;
        }
        try {
          const response = await fetch("https://discord.com/api/users/@me/guilds", { headers: { Authorization: `Bearer ${session.accessToken}` } });
          if (!response.ok) { json(res, 502, { error: "discord_guild_lookup_failed" }); return; }
          const guilds = await response.json() as DiscordGuild[];
          const canManage = identities.some((identity) => {
            const guild = guilds.find((item) => item.id === identity.externalId);
            if (!guild) return false;
            const permissions = discordGuildPermissions(guild);
            return guild.owner || (permissions & 0x8n) === 0x8n || (permissions & 0x20n) === 0x20n;
          });
          if (!canManage) { json(res, 403, { error: "community_management_forbidden" }); return; }
        } catch {
          json(res, 502, { error: "discord_guild_lookup_failed" });
          return;
        }
      }
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
      if (!communityId) { json(res, 400, { error: "communityId_required" }); return; }
      if (!database.getCommunitiesSnapshot().some((item) => item.id === communityId)) {
        json(res, 404, { error: "community_not_found" }); return;
      }
      const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "25", 10) || 25));
      const items = database.getAuditEntries(communityId, 500);
      json(res, 200, { items: items.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: items.length, pages: Math.ceil(items.length / limit) } });
      return;
    }

    if (url.pathname === "/api/moderation/cases" && req.method === "POST") {
      const body = await readJsonBody(req);
      const action = body.action;
      const platform = body.platform;
      const actorUserId = typeof body.actorUserId === "string" ? body.actorUserId : "";
      const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
      const communityId = typeof body.communityId === "string" ? body.communityId : "";
      const communityExternalId = typeof body.communityExternalId === "string" ? body.communityExternalId : "";
      const userExternalId = typeof body.userExternalId === "string" ? body.userExternalId : "";
      if (!["warn", "mute", "kick", "ban"].includes(String(action)) ||
          !["telegram", "discord"].includes(String(platform)) || !actorUserId || !targetUserId ||
          !communityId || !communityExternalId || !userExternalId ||
          !database.getUser(actorUserId) || !database.getUser(targetUserId) ||
          !database.getCommunitiesSnapshot().some((item) => item.id === communityId)) {
        json(res, 400, { error: "invalid_moderation_case" }); return;
      }
      if (body.durationSeconds !== undefined && (!Number.isFinite(body.durationSeconds) || Number(body.durationSeconds) <= 0)) {
        json(res, 400, { error: "durationSeconds_must_be_positive" }); return;
      }
      try {
        const result = runtimeServices.moderationService.createCase({
          action: action as "warn" | "mute" | "kick" | "ban",
          actorUserId: actorUserId as never,
          targetUserId: targetUserId as never,
          communityId: communityId as never,
          platform: platform as "telegram" | "discord",
          communityExternalId,
          userExternalId,
          ...(typeof body.durationSeconds === "number" ? { durationSeconds: body.durationSeconds } : {}),
          ...(typeof body.reason === "string" ? { reason: body.reason.slice(0, 1000) } : {})
        });
        const queued = enqueueAdapterAction(result.adapterAction, communityId, `moderation:${result.case.id}`);
        json(res, 201, { item: result.case, adapterAction: result.adapterAction, execution: { status: "queued", actionId: queued.id } });
      } catch (error) {
        json(res, 403, { error: error instanceof Error ? error.message : "moderation_create_failed" });
      }
      return;
    }

    if (url.pathname === "/api/moderation" && req.method === "GET") {
      const communityId = url.searchParams.get("communityId");
      if (!communityId) { json(res, 400, { error: "communityId_required" }); return; }
      if (!database.getCommunitiesSnapshot().some((item) => item.id === communityId)) {
        json(res, 404, { error: "community_not_found" }); return;
      }
      const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "25", 10) || 25));
      const status = url.searchParams.get("status");
      const action = url.searchParams.get("action");
      const all = database.getModerationCases(communityId).filter((item) => {
        return (!status || item.status === status) && (!action || item.action === action);
      });
      json(res, 200, { items: all.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: all.length, pages: Math.ceil(all.length / limit) } });
      return;
    }

    if (url.pathname === "/api/moderation/revoke" && req.method === "POST") {
      const body = await readJsonBody(req);
      const actorUserId = typeof body.actorUserId === "string" ? body.actorUserId : "";
      const caseId = typeof body.caseId === "string" ? body.caseId : "";
      if (!actorUserId || !caseId) { json(res, 400, { error: "actorUserId_and_caseId_required" }); return; }
      try {
        const item = runtimeServices.moderationService.revokeCase(actorUserId as never, caseId);
        let queuedAction: { id: string } | undefined;
        if (item.action === "mute" || item.action === "ban") {
          queuedAction = enqueueAdapterAction({
            type: item.action === "mute" ? "member.unmute" : "member.unban",
            platform: item.platform,
            communityExternalId: item.communityExternalId,
            userExternalId: item.userExternalId,
            metadata: { moderationCaseId: item.id }
          }, item.communityId, `moderation-revoke:${item.id}`);
        }
        json(res, 200, { item, ...(queuedAction ? { execution: { status: "queued", actionId: queuedAction.id } } : {}) });
      } catch (error) {
        json(res, 403, { error: error instanceof Error ? error.message : "moderation_revoke_failed" });
      }
      return;
    }

    if (url.pathname === "/api/actions" && req.method === "GET") {
      const communityId = url.searchParams.get("communityId");
      const status = url.searchParams.get("status");
      const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
      const queue = database.getRuntimeState<Array<Record<string, unknown>>>("api.action_queue") ?? [];
      const items = queue.filter((item) => (!communityId || item.communityId === communityId) && (!status || item.status === status)).slice(-limit).reverse();
      json(res, 200, { items, limit }); return;
    }

    const actionMatch = url.pathname.match(/^\/api\/actions\/([^/]+)$/);
    if (actionMatch && req.method === "GET") {
      const id = decodeURIComponent(actionMatch[1]!);
      const queue = database.getRuntimeState<Array<Record<string, unknown>>>("api.action_queue") ?? [];
      const item = queue.find((entry) => entry.id === id);
      if (!item) { json(res, 404, { error: "action_not_found" }); return; }
      json(res, 200, { item }); return;
    }

    if (url.pathname === "/api/backup" && req.method === "GET") {
      if (!authorized(req)) { json(res, 403, { error: "api_key_required" }); return; }
      const artifact = backup.exportSnapshot();
      json(res, 200, artifact);
      return;
    }

    json(res, 404, { error: "not_found" });
  })().catch((error) => {
    const message = error instanceof Error ? error.message : "internal_error";
    // Keep detailed failures in the local API terminal without exposing internals to browser clients.
    console.error("[Modexa API]", req.method ?? "UNKNOWN", req.url ?? "/", error);
    if (message === "request_body_too_large") {
      json(res, 413, { error: message });
      return;
    }
    if (message === "invalid_json" || message === "json_object_required") {
      json(res, 400, { error: message });
      return;
    }
    if (error instanceof DiscordApiError && error.status === 429) {
      json(res, 429, {
        error: "discord_rate_limited",
        retryAfterSeconds: error.retryAfterSeconds ?? 1
      });
      return;
    }
    if (error instanceof DiscordApiError) {
      json(res, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: "discord_api_error",
        status: error.status
      });
      return;
    }
    json(res, 500, { error: "internal_error" });
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
