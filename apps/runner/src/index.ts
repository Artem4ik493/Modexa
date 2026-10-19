import {
  AdapterRegistry,
  CoreLogger,
  createRuntimeServices,
  ModexaDatabase,
  InteractionActionStore,
  type AdapterAction,
  type PlatformAdapter
} from "@modexa/core";

import {
  createInterface
} from "node:readline";

import {
  createDiscordAdapter
} from "../../discord/src/bot.js";

import {
  createTelegramAdapter
} from "../../telegram/src/bot.js";

import {
  renderTelegramInteraction
} from "../../telegram/src/interactions.js";

import {
  renderDiscordInteraction
} from "../../discord/src/interactions.js";

function redactLogValue(value: unknown, key = ""): unknown {
  if (/(token|secret|password|authorization|cookie|api.?key)/i.test(key)) {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([childKey, childValue]) => [
          childKey,
          redactLogValue(childValue, childKey)
        ]
      )
    );
  }
  return value;
}

const logger =
  new CoreLogger("debug");

logger.addHandler(
  (entry) => {
    const timestamp =
      entry.timestamp
        .toISOString()
        .slice(11, 23);

    const level =
      entry.level
        .toUpperCase()
        .padEnd(5);

    const correlation =
      entry.context?.correlationId
        ? ` [${entry.context.correlationId}]`
        : "";

    console.log(
      `[${timestamp}] ${level}${correlation} ${entry.message}`
    );

    if (entry.context && Object.keys(entry.context).length > 0) {
      console.log(
        `        context: ${JSON.stringify(redactLogValue(entry.context))}`
      );
    }

    if (entry.error) {
      console.log(
        `        error: ${entry.error.name}: ${entry.error.message}`
      );
      if (entry.error.stack) {
        console.log(`        stack: ${entry.error.stack.replace(/\n/g, "\n        ")}`);
      }
    }
  }
);

const database = new ModexaDatabase({
  path:
    process.env.MODEXA_DATABASE_PATH ??
    "data/modexa.sqlite"
});

// One set of services for all adapters: Telegram and Discord
// must see the same users, communities, memberships and permissions.
const services =
  createRuntimeServices(
    logger,
    database
  );

const adapters: PlatformAdapter[] =
  [];

const interactionStore =
  new InteractionActionStore();

const telegramToken =
  process.env.TELEGRAM_BOT_TOKEN;

if (telegramToken) {
  adapters.push(
    createTelegramAdapter(
      telegramToken,
      logger,
      {
        identityResolver:
          services.identityResolver,

        executionContextService:
          services.executionContextService,

        interactionStore,

        bridgeService:
          services.bridgeService,

        communityService:
          services.communityService,

        membershipService:
          services.membershipService,

        identityService:
          services.identityService,

        identityLinkService:
          services.identityLinkService,

        identityLinkingService:
          services.identityLinkingService,

        accessControlService:
          services.accessControlService,

        moderationService:
          services.moderationService,

        commandSettingsService:
          services.commandSettingsService,

        database:
          database,

        auditService:
          services.auditService,
        autoModService:
          services.autoModService
      }
    )
  );
} else {
  logger.warn(
    "adapter.skipped",
    {
      platform: "telegram",
      reason:
        "TELEGRAM_BOT_TOKEN is not set"
    }
  );
}

const discordToken =
  process.env.DISCORD_BOT_TOKEN;

if (discordToken) {
  adapters.push(
    createDiscordAdapter(
      discordToken,
      logger,
      {
        identityResolver:
          services.identityResolver,

        executionContextService:
          services.executionContextService,

        interactionStore,

        bridgeService:
          services.bridgeService,

        communityService:
          services.communityService,

        membershipService:
          services.membershipService,

        identityService:
          services.identityService,

        identityLinkService:
          services.identityLinkService,

        identityLinkingService:
          services.identityLinkingService,

        accessControlService:
          services.accessControlService,

        moderationService:
          services.moderationService,

        commandSettingsService:
          services.commandSettingsService,

        database:
          database,

        auditService:
          services.auditService,
        autoModService:
          services.autoModService
      }
    )
  );
} else {
  logger.warn(
    "adapter.skipped",
    {
      platform: "discord",
      reason:
        "DISCORD_BOT_TOKEN is not set"
    }
  );
}

if (adapters.length === 0) {
  throw new Error(
    "No adapters to run: set TELEGRAM_BOT_TOKEN and/or DISCORD_BOT_TOKEN in .env"
  );
}

services.bridgeService.setMessageGateway({
  async sendMessage({
    platform,
    channelExternalId,
    response
  }) {
    const adapter =
      adapters.find(
        (item) =>
          item.platform === platform
      );

    if (!adapter) {
      throw new Error(
        `No ${platform} adapter is available for Bridge messaging`
      );
    }

    const bound =
      interactionStore.bindResponse(
        response,
        { platform }
      );

    const metadata =
      platform === "telegram"
        ? (() => {
            const replyMarkup =
              renderTelegramInteraction(
                bound
              );

            return {
              telegram: {
                ...(replyMarkup ? { replyMarkup } : {}),
                ...(bound.media ? { media: bound.media } : {}),
                ...(bound.imageUrl ? { imageUrl: bound.imageUrl } : {}),
                ...(bound.embed ? { embed: bound.embed } : {}),
                ...(bound.format === "markdown" ? { parseMode: "Markdown" } : {})
              }
            };
          })()
        : (() => {
            const components =
              renderDiscordInteraction(
                bound
              );

            return {
              discord: {
                ...(components ? { components } : {}),
                ...(bound.media ? { media: bound.media } : {}),
                ...(bound.imageUrl ? { imageUrl: bound.imageUrl } : {}),
                ...(bound.embed ? { embed: bound.embed } : {})
              }
            };
          })();

    return await adapter.sendAction({
      type: "message.send",
      platform,
      channelExternalId,
      content:
        bound.content ?? "…",
      metadata
    }).then((messageId) =>
      typeof messageId === "string"
        ? messageId
        : undefined
    );
  },

  async editMessage({
    platform,
    channelExternalId,
    messageExternalId,
    response
  }) {
    const adapter =
      adapters.find(
        (item) => item.platform === platform
      );

    if (!adapter) {
      throw new Error(
        `No ${platform} adapter is available for Bridge messaging`
      );
    }

    const bound =
      interactionStore.bindResponse(
        response,
        { platform }
      );

    const metadata =
      platform === "telegram"
        ? (() => {
            const replyMarkup =
              renderTelegramInteraction(bound);
            return {
              telegram: {
                ...(replyMarkup ? { replyMarkup } : {}),
                ...(bound.media ? { media: bound.media } : {}),
                ...(bound.imageUrl ? { imageUrl: bound.imageUrl } : {}),
                ...(bound.embed ? { embed: bound.embed } : {}),
                ...(bound.format === "markdown" ? { parseMode: "Markdown" } : {})
              }
            };
          })()
        : (() => {
            const components =
              renderDiscordInteraction(bound);
            return {
              discord: {
                ...(components ? { components } : {}),
                ...(bound.media ? { media: bound.media } : {}),
                ...(bound.imageUrl ? { imageUrl: bound.imageUrl } : {}),
                ...(bound.embed ? { embed: bound.embed } : {})
              }
            };
          })();

    await adapter.sendAction({
      type: "message.edit",
      platform,
      channelExternalId,
      messageExternalId,
      content: bound.content ?? "…",
      metadata
    });
  },

  async deleteMessage({
    platform,
    channelExternalId,
    messageExternalId
  }) {
    const adapter =
      adapters.find(
        (item) => item.platform === platform
      );

    if (!adapter) {
      throw new Error(
        `No ${platform} adapter is available for Bridge messaging`
      );
    }

    await adapter.sendAction({
      type: "message.delete",
      platform,
      channelExternalId,
      messageExternalId
    });
  }
});

const registry =
  new AdapterRegistry();

for (const adapter of adapters) {
  registry.register(adapter);
}

const failed =
  new Set<string>();

type QueuedApiAction = {
  id: string;
  communityId: string;
  source: string;
  action: AdapterAction;
  status: "pending" | "processing" | "succeeded" | "failed";
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

let processingApiActions = false;

function updateQueuedAction(id: string, patch: Partial<QueuedApiAction>): void {
  const queue = database.getRuntimeState<QueuedApiAction[]>("api.action_queue") ?? [];
  const updated = queue.map((item) => item.id === id ? { ...item, ...patch } : item);
  database.setRuntimeState("api.action_queue", updated);
}

function updateModerationCaseForAction(source: string, succeeded: boolean, error?: string): void {
  const match = source.match(/^moderation:(mod_[^:]+)$/);
  if (!match) return;
  try {
    // The API can create a case after Runner startup, so update the shared database
    // record directly instead of relying on Runner's in-memory service cache.
    const item = database.getAllModerationCases().find((entry) => entry.id === match[1]);
    if (!item || item.status !== "pending") {
      logger.warn("moderation.case.status_update_skipped", { caseId: match[1], found: Boolean(item), status: item?.status });
      return;
    }
    const now = new Date();
    if (succeeded) {
      item.status = "active";
      item.appliedAt = now;
      item.failureReason = undefined;
      if (item.supersedesCaseId) {
        const previous = database.getAllModerationCases().find((entry) => entry.id === item.supersedesCaseId);
        if (previous?.status === "active") {
          previous.status = "revoked";
          previous.revokedAt = now;
          database.upsertModerationCase(previous);
        }
      }
    } else {
      item.status = "failed";
      item.failedAt = now;
      item.failureReason = (error ?? "Adapter action failed").slice(0, 1000);
    }
    database.upsertModerationCase(item);
  } catch (statusError) {
    logger.error("moderation.case.status_update_failed", { caseId: match[1], succeeded }, statusError);
  }
}

async function sendConfiguredAuditLog(item: QueuedApiAction, succeeded: boolean, error?: string): Promise<void> {
  const sourceCategory = item.source.startsWith("moderation") ? "moderation" : "panel";
  const settings = database.getRuntimeState<Record<string, unknown>>(`api.audit_settings.${item.communityId}`) ?? {};
  const channelId = typeof settings.channelId === "string" ? settings.channelId.trim() : "";
  const actions = Array.isArray(settings.actions) ? settings.actions as string[] : [];
  if (settings.enabled !== true) {
    logger.info("audit.channel_delivery_skipped", { reason: "disabled", communityId: item.communityId, actionId: item.id });
    return;
  }
  if (!/^\d{15,25}$/.test(channelId)) {
    logger.warn("audit.channel_delivery_skipped", { reason: "invalid_or_missing_channel_id", communityId: item.communityId, actionId: item.id });
    return;
  }
  if (actions.length > 0 && !actions.includes(sourceCategory)) {
    logger.info("audit.channel_delivery_skipped", { reason: "category_not_selected", sourceCategory, selectedActions: actions, communityId: item.communityId, actionId: item.id });
    return;
  }
  const discord = adapters.find((candidate) => candidate.platform === "discord");
  if (!discord) {
    logger.error("audit.channel_delivery_failed", { reason: "discord_adapter_not_running", communityId: item.communityId, channelId, actionId: item.id });
    return;
  }
  const actionType = typeof item.action.type === "string" ? item.action.type : "unknown";
  const lines = [
    "**Modexa · журнал модерации**",
    `Результат: ${succeeded ? "УСПЕШНО" : "ОШИБКА"}`,
    `Действие: ${actionType}`,
    `Сообщество: ${item.communityId}`,
    `Источник: ${item.source}`,
    ...(error ? [`Ошибка: ${error.slice(0, 500)}`] : []),
    `Время: ${new Date().toISOString()}`
  ];
  const content = lines.join("\n");
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await discord.sendAction({ type: "message.send", platform: "discord", channelExternalId: channelId, content });
      logger.info("audit.channel_delivery_succeeded", { communityId: item.communityId, channelId, actionId: item.id, attempt });
      return;
    } catch (deliveryError) {
      lastError = deliveryError;
      logger.warn("audit.channel_delivery_retry", { communityId: item.communityId, channelId, actionId: item.id, attempt, error: deliveryError instanceof Error ? deliveryError.message : String(deliveryError) });
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  logger.error("audit.channel_delivery_failed", { communityId: item.communityId, channelId, actionId: item.id, error: lastError instanceof Error ? lastError.message : String(lastError) });
}
type StoredAuditEntry = {
  id: string;
  communityId: string;
  action: string;
  actorUserId?: string;
  targetUserId?: string;
  channelId?: string;
  messageId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date | string;
};

function auditCategory(action: string): string {
  if (/^(member\.|moderation\.|automod\.)/.test(action)) return "moderation";
  if (/^automation\./.test(action)) return "panel";
  if (/^(channel\.|role\.)/.test(action)) return "settings";
  return "panel";
}

async function dispatchRecordedAuditEntries(): Promise<void> {
  for (const community of database.getCommunitiesSnapshot()) {
    const settings = database.getRuntimeState<Record<string, unknown>>(`api.audit_settings.${community.id}`) ?? {};
    if (settings.enabled !== true) continue;
    const channelId = typeof settings.channelId === "string" ? settings.channelId.trim() : "";
    if (!/^\\d{15,25}$/.test(channelId)) continue;
    const entries = database.getAuditEntries(community.id, 100) as StoredAuditEntry[];
    const key = `api.audit_dispatched.${community.id}`;
    const stored = database.getRuntimeState<string[]>(key);
    const seen = new Set(Array.isArray(stored) ? stored : []);
    // On first run, establish a baseline rather than flooding the configured channel
    // with historical records. Future records are delivered exactly once per stored ID.
    if (!stored) {
      database.setRuntimeState(key, entries.map((entry) => entry.id).filter(Boolean).slice(0, 500));
      continue;
    }
    const fresh = entries.filter((entry) => entry.id && !seen.has(entry.id)).reverse();
    if (fresh.length === 0) continue;
    const actions = Array.isArray(settings.actions) ? settings.actions as string[] : [];
    const discord = adapters.find((candidate) => candidate.platform === "discord");
    if (!discord) {
      logger.warn("audit.event_delivery_skipped", { reason: "discord_adapter_not_running", communityId: community.id, count: fresh.length });
      continue;
    }
    const deliveredIds = [...seen];
    for (const entry of fresh) {
      const category = auditCategory(entry.action);
      if (actions.length > 0 && !actions.includes(category)) {
        deliveredIds.push(entry.id);
        continue;
      }
      const createdAt = entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt);
      const content = [
        "**Modexa · журнал аудита**",
        `Событие: ${entry.action}`,
        `Участник: ${entry.actorUserId ?? "—"}`,
        `Цель: ${entry.targetUserId ?? "—"}`,
        `Канал: ${entry.channelId ?? "—"}`,
        `Причина: ${entry.reason ?? "—"}`,
        `Сообщество: ${community.id}`,
        `Время: ${createdAt}`
      ].join("\\n").slice(0, 1900);
      try {
        await discord.sendAction({ type: "message.send", platform: "discord", channelExternalId: channelId, content });
        deliveredIds.push(entry.id);
        logger.info("audit.event_delivery_succeeded", { communityId: community.id, channelId, auditId: entry.id });
      } catch (error) {
        logger.warn("audit.event_delivery_failed", { communityId: community.id, channelId, auditId: entry.id, error: error instanceof Error ? error.message : String(error) });
        // Keep the failed event out of the cursor so the next polling cycle retries it.
        break;
      }
    }
    database.setRuntimeState(key, [...new Set(deliveredIds)].slice(-500));
  }
}

async function processPendingApiActions(): Promise<void> {
  if (processingApiActions || stopping) return;
  processingApiActions = true;
  try {
    services.bridgeService.refreshFromDatabase();
    await dispatchRecordedAuditEntries();
    const queue = database.getRuntimeState<QueuedApiAction[]>("api.action_queue") ?? [];
    for (const item of queue.filter((entry) => entry.status === "pending").slice(0, 20)) {
      updateQueuedAction(item.id, { status: "processing", startedAt: new Date().toISOString() });
      try {
        const adapter = adapters.find((candidate) => candidate.platform === item.action.platform);
        if (!adapter) throw new Error(`No adapter for platform ${item.action.platform}`);
        await adapter.sendAction(item.action);
        updateQueuedAction(item.id, { status: "succeeded", finishedAt: new Date().toISOString(), error: undefined });
        updateModerationCaseForAction(item.source, true);
        await sendConfiguredAuditLog(item, true);
        logger.info("api.action.succeeded", { actionId: item.id, source: item.source, platform: item.action.platform });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "adapter_action_failed";
        updateQueuedAction(item.id, { status: "failed", finishedAt: new Date().toISOString(), error: message });
        updateModerationCaseForAction(item.source, false, message);
        await sendConfiguredAuditLog(item, false, message);
        logger.error("api.action.failed", { actionId: item.id, source: item.source, platform: item.action.platform }, error);
      }
    }
  } finally {
    processingApiActions = false;
  }
}

const apiActionWorker = setInterval(() => {
  void processPendingApiActions();
}, 1000);
apiActionWorker.unref();

console.log("");
console.log("================================");
console.log("            MODEXA");
console.log("================================");
console.log("");
console.log("Status: STARTING");
console.log(
  `Adapters: ${adapters
    .map(
      (adapter) =>
        adapter.id
    )
    .join(", ")}`
);
console.log("");

const consoleInterface =
  createInterface({
    input:
      process.stdin,
    output:
      process.stdout,
    prompt:
      "modexa> "
  });

let stopping = false;

async function shutdown(): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;
  clearInterval(apiActionWorker);

  console.log("");
  console.log(
    "Status: STOPPING"
  );

  const results =
    await Promise.allSettled(
      registry
        .list()
        .map(
          (adapter) =>
            adapter.stop()
        )
    );

  results.forEach(
    (result, index) => {
      if (
        result.status ===
        "rejected"
      ) {
        logger.error(
          "adapter.shutdown.failed",
          {
            adapterId:
              registry.list()[
                index
              ]?.id
          },
          result.reason
        );
      }
    }
  );

  console.log(
    "Status: STOPPED"
  );

  consoleInterface.close();
  database.close();

  process.exit(0);
}

consoleInterface.on(
  "line",
  async (input) => {
    const command =
      input
        .trim()
        .toLowerCase();

    if (!command) {
      consoleInterface.prompt();
      return;
    }

    if (command === "status") {
      console.log("");
      console.log(
        "Status: RUNNING"
      );

      for (const adapter of adapters) {
        console.log(
          `  ${adapter.id} (${adapter.platform}): ${
            failed.has(adapter.id)
              ? "FAILED"
              : "started"
          }`
        );
      }

      console.log("");

      consoleInterface.prompt();
      return;
    }

    if (command === "stop") {
      await shutdown();
      return;
    }

    if (command === "help") {
      console.log("");
      console.log(
        "Available local commands:"
      );
      console.log(
        "  status  - show adapters"
      );
      console.log(
        "  stop    - stop Modexa"
      );
      console.log(
        "  help    - show this help"
      );
      console.log("");

      consoleInterface.prompt();
      return;
    }

    console.log(
      `Unknown local command: ${command}`
    );
    console.log(
      'Type "help" for available commands.'
    );

    consoleInterface.prompt();
  }
);

consoleInterface.on(
  "SIGINT",
  () => {
    void shutdown();
  }
);

process.on(
  "SIGTERM",
  () => {
    void shutdown();
  }
);

process.on("message", (message: unknown) => {
  if (
    message &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === "shutdown"
  ) {
    void shutdown();
  }
});

// Adapters are started independently and concurrently.
// registry.startAll() is not used on purpose: it starts
// adapters one by one, so a start() that only returns when
// the adapter stops would block every adapter after it.
for (const adapter of adapters) {
  logger.info(
    "adapter.starting",
    {
      adapterId:
        adapter.id,
      platform:
        adapter.platform
    }
  );

  void adapter
    .start()
    .catch(
      (error) => {
        failed.add(
          adapter.id
        );

        logger.error(
          "adapter.start.failed",
          {
            adapterId:
              adapter.id,
            platform:
              adapter.platform
          },
          error
        );

        if (
          failed.size ===
          adapters.length
        ) {
          console.error("");
          console.error(
            "Status: FAILED"
          );
          console.error(
            "No adapter could be started."
          );

          consoleInterface.close();

          process.exit(1);
        }
      }
    );
}

console.log(
  "Status: RUNNING"
);
console.log(
  'Type "help" for local commands.'
);
console.log("");

consoleInterface.prompt();