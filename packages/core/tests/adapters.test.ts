import { describe, expect, it } from "vitest";

import type {
  AdapterAction
} from "../src/adapters/actions.js";

import type {
  AdapterEvent
} from "../src/adapters/events.js";

import type {
  PlatformAdapter
} from "../src/adapters/adapter.js";

import {
  AdapterRegistry
} from "../src/adapters/registry.js";

function createMockAdapter(
  id: string,
  platform: "telegram" | "discord"
): PlatformAdapter {
  const eventHandlers: Array<
    (event: AdapterEvent) => void | Promise<void>
  > = [];

  return {
    id,
    platform,

    async start() {},

    async stop() {},

    async sendAction(
      _action: AdapterAction
    ) {},

    async resolveUser(
      externalId: string
    ) {
      return {
        platform,
        externalId,
        displayName: `User ${externalId}`
      };
    },

    async resolveCommunity(
      externalId: string
    ) {
      return {
        platform,
        externalId,
        name: `Community ${externalId}`
      };
    },

    async resolveChannel(
      externalId: string
    ) {
      return {
        platform,
        externalId,
        name: `Channel ${externalId}`
      };
    },

    onEvent(
      handler
    ) {
      eventHandlers.push(handler);
    }
  };
}

describe("AdapterRegistry", () => {
  it("registers and retrieves adapters", () => {
    const registry =
      new AdapterRegistry();

    const adapter =
      createMockAdapter(
        "telegram-main",
        "telegram"
      );

    registry.register(adapter);

    expect(
      registry.get("telegram-main")
    ).toBe(adapter);

    expect(
      registry.has("telegram-main")
    ).toBe(true);
  });

  it("rejects duplicate adapter ids", () => {
    const registry =
      new AdapterRegistry();

    registry.register(
      createMockAdapter(
        "telegram-main",
        "telegram"
      )
    );

    expect(() =>
      registry.register(
        createMockAdapter(
          "telegram-main",
          "telegram"
        )
      )
    ).toThrow(
      'Adapter "telegram-main" is already registered'
    );
  });

  it("lists adapters by platform", () => {
    const registry =
      new AdapterRegistry();

    const telegram =
      createMockAdapter(
        "telegram-main",
        "telegram"
      );

    const discord =
      createMockAdapter(
        "discord-main",
        "discord"
      );

    registry.register(telegram);
    registry.register(discord);

    expect(
      registry.getByPlatform(
        "telegram"
      )
    ).toEqual([telegram]);

    expect(
      registry.getByPlatform(
        "discord"
      )
    ).toEqual([discord]);
  });

  it("unregisters adapters", () => {
    const registry =
      new AdapterRegistry();

    registry.register(
      createMockAdapter(
        "telegram-main",
        "telegram"
      )
    );

    expect(
      registry.unregister(
        "telegram-main"
      )
    ).toBe(true);

    expect(
      registry.get(
        "telegram-main"
      )
    ).toBeUndefined();

    expect(
      registry.unregister(
        "telegram-main"
      )
    ).toBe(false);
  });

  it("starts all adapters", async () => {
    const registry =
      new AdapterRegistry();

    const started: string[] = [];

    const adapter =
      createMockAdapter(
        "telegram-main",
        "telegram"
      );

    adapter.start = async () => {
      started.push(adapter.id);
    };

    registry.register(adapter);

    await registry.startAll();

    expect(started).toEqual([
      "telegram-main"
    ]);
  });

  it("stops all adapters in reverse order", async () => {
    const registry =
      new AdapterRegistry();

    const stopped: string[] = [];

    const telegram =
      createMockAdapter(
        "telegram-main",
        "telegram"
      );

    const discord =
      createMockAdapter(
        "discord-main",
        "discord"
      );

    telegram.stop = async () => {
      stopped.push(telegram.id);
    };

    discord.stop = async () => {
      stopped.push(discord.id);
    };

    registry.register(telegram);
    registry.register(discord);

    await registry.stopAll();

    expect(stopped).toEqual([
      "discord-main",
      "telegram-main"
    ]);
  });

  it("resolves platform entities through an adapter", async () => {
    const registry =
      new AdapterRegistry();

    registry.register(
      createMockAdapter(
        "telegram-main",
        "telegram"
      )
    );

    const adapter =
      registry.get(
        "telegram-main"
      );

    expect(adapter).toBeDefined();

    const user =
      await adapter!.resolveUser(
        "42"
      );

    const community =
      await adapter!.resolveCommunity(
        "100"
      );

    const channel =
      await adapter!.resolveChannel(
        "200"
      );

    expect(user).toEqual({
      platform: "telegram",
      externalId: "42",
      displayName: "User 42"
    });

    expect(community).toEqual({
      platform: "telegram",
      externalId: "100",
      name: "Community 100"
    });

    expect(channel).toEqual({
      platform: "telegram",
      externalId: "200",
      name: "Channel 200"
    });
  });
});