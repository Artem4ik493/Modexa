import { describe, expect, it, vi } from "vitest";

import {
  BridgeService
} from "../src/bridge/service.js";

import type {
  ExecutionContext
} from "../src/contexts/types.js";

function createExecution(
  platform: "telegram" | "discord",
  communityId: string,
  channelId: string
): ExecutionContext {
  return {
    type: "community",
    platform,
    correlationId: `${platform}-test`,
    user: {
      id: "user-1",
      displayName: "Admin",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    },
    community: {
      id: communityId,
      name: platform === "telegram" ? "Telegram Chat" : "Discord Server",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    },
    channel: {
      id: channelId,
      communityId,
      name: platform === "telegram" ? "Telegram Chat" : "general",
      type: platform === "telegram" ? "telegram_chat" : "discord_text",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    },
    capabilities: [
      "commands",
      "community.manage",
      "bridge"
    ]
  };
}

describe("BridgeService", () => {
  it("creates a cross-platform request and confirms it only in the target chat", async () => {
    const service = new BridgeService();

    const sendMessage = vi.fn().mockResolvedValue(undefined);

    service.setMessageGateway({
      sendMessage
    });

    const source = service.registerEndpoint({
      platform: "telegram",
      communityExternalId: "-1001",
      communityName: "TG Chat",
      channelExternalId: "-1001",
      channelName: "TG Chat",
      communityId: "community-1",
      channelId: "channel-1"
    });

    const target = service.registerEndpoint({
      platform: "discord",
      communityExternalId: "guild-1",
      communityName: "DS Server",
      channelExternalId: "channel-1",
      channelName: "general",
      communityId: "community-2",
      channelId: "channel-2"
    });

    const request = service.createLinkRequest({
      sourceEndpointId: source.id,
      targetEndpointId: target.id,
      requestedByUserId: "user-1"
    });

    await service.sendConfirmation(
      request,
      "ru"
    );

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "discord",
        channelExternalId: "channel-1"
      })
    );

    await expect(
      service.confirmRequest(
        request.id,
        createExecution(
          "telegram",
          "community-1",
          "channel-1"
        )
      )
    ).rejects.toThrow(
      "Bridge confirmation must be performed in the target chat"
    );

    const result =
      await service.confirmRequest(
        request.id,
        createExecution(
          "discord",
          "community-2",
          "channel-2"
        )
      );

    expect(result.request.status).toBe(
      "confirmed"
    );

    expect(
      service.isLinked(
        source.id,
        target.id
      )
    ).toBe(true);
  });

  it("rejects duplicate links and same-platform links", () => {
    const service = new BridgeService();

    const telegram = service.registerEndpoint({
      platform: "telegram",
      communityExternalId: "tg",
      communityName: "TG",
      channelExternalId: "tg",
      channelName: "TG"
    });

    const discord = service.registerEndpoint({
      platform: "discord",
      communityExternalId: "ds",
      communityName: "DS",
      channelExternalId: "ds",
      channelName: "general"
    });

    const otherTelegram =
      service.registerEndpoint({
        platform: "telegram",
        communityExternalId: "tg-2",
        communityName: "TG 2",
        channelExternalId: "tg-2",
        channelName: "TG 2"
      });

    service.createLinkRequest({
      sourceEndpointId: telegram.id,
      targetEndpointId: discord.id,
      requestedByUserId: "user-1"
    });

    expect(() =>
      service.createLinkRequest({
        sourceEndpointId: telegram.id,
        targetEndpointId: discord.id,
        requestedByUserId: "user-1"
      })
    ).toThrow(
      "A bridge confirmation is already pending for these endpoints"
    );

    expect(() =>
      service.createLinkRequest({
        sourceEndpointId: telegram.id,
        targetEndpointId: otherTelegram.id,
        requestedByUserId: "user-1"
      })
    ).toThrow(
      "Bridge test currently supports only Telegram to Discord links"
    );
  });
});
