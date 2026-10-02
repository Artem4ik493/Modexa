import {
  AdapterRegistry,
  CoreLogger,
  createRuntimeServices,
  InteractionActionStore,
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

    if (entry.error) {
      console.log(
        `        ${entry.error.name}: ${entry.error.message}`
      );
    }
  }
);

// One set of services for all adapters: Telegram and Discord
// must see the same users, communities, memberships and permissions.
const services =
  createRuntimeServices(logger);

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
          services.communityService
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
          services.communityService
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

            return replyMarkup
              ? { telegram: { replyMarkup } }
              : undefined;
          })()
        : (() => {
            const components =
              renderDiscordInteraction(
                bound
              );

            return components
              ? { discord: { components } }
              : undefined;
          })();

    await adapter.sendAction({
      type: "message.send",
      platform,
      channelExternalId,
      content:
        bound.content ?? "…",
      metadata
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