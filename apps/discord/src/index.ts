import {
  AdapterRegistry,
  CoreLogger
} from "@modexa/core";

import {
  createDiscordAdapter
} from "./bot.js";

import {
  createInterface
} from "node:readline";

const token =
  process.env.DISCORD_BOT_TOKEN;

if (!token) {
  throw new Error(
    "DISCORD_BOT_TOKEN environment variable is not set"
  );
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
  }
);

const adapter =
  createDiscordAdapter(
    token,
    logger
  );

const registry =
  new AdapterRegistry();

registry.register(adapter);

console.log("");
console.log("================================");
console.log("         MODEXA DISCORD");
console.log("================================");
console.log("");
console.log("Status: STARTING");
console.log("");

const consoleInterface =
  createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "modexa> "
  });

let stopping = false;

consoleInterface.on(
  "line",
  async (input) => {
    const command =
      input.trim().toLowerCase();

    if (!command) {
      consoleInterface.prompt();
      return;
    }

    if (command === "status") {
      console.log("");
      console.log("Status: RUNNING");
      console.log(`Adapter: ${adapter.id}`);
      console.log(`Platform: ${adapter.platform}`);
      console.log("");

      consoleInterface.prompt();
      return;
    }

    if (command === "stop") {
      if (stopping) {
        return;
      }

      stopping = true;

      console.log("Status: STOPPING");

      try {
        await registry.stopAll();

        console.log("Status: STOPPED");

        consoleInterface.close();
        process.exit(0);
      } catch (error) {
        logger.error(
          "adapter.shutdown.failed",
          {
            adapterId: adapter.id,
            platform: adapter.platform
          },
          error
        );

        stopping = false;
        consoleInterface.prompt();
      }

      return;
    }

    if (command === "help") {
      console.log("");
      console.log("Available local commands:");
      console.log("  status  - show bot status");
      console.log("  stop    - stop Modexa");
      console.log("  help    - show this help");
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

void registry
  .startAll()
  .then(() => {
    logger.info(
      "adapter.started",
      {
        adapterId: adapter.id,
        platform: adapter.platform
      }
    );

    console.log("");
    console.log("Status: RUNNING");
    console.log('Type "help" for local commands.');
    console.log("");

    consoleInterface.prompt();
  })
  .catch((error) => {
    logger.error(
      "adapter.start.failed",
      {
        adapterId: adapter.id,
        platform: adapter.platform
      },
      error
    );

    console.error("Status: FAILED");

    consoleInterface.close();
    process.exit(1);
  });