import { describe, expect, it, vi } from "vitest";

import {
  BridgeService
} from "../src/bridge/service.js";

import {
  CommunityService
} from "../src/communities/service.js";

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

  it("relays messages with platform prefixes to every linked endpoint", async () => {
    const service = new BridgeService();
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    service.setMessageGateway({
      sendMessage
    });

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
      channelName: "general",
      communityId: "ds",
      channelId: "ds"
    });

    const request = service.createLinkRequest({
      sourceEndpointId: telegram.id,
      targetEndpointId: discord.id,
      requestedByUserId: "user-1"
    });

    await service.confirmRequest(
      request.id,
      createExecution("discord", "ds", "ds")
    );

    await service.relayMessage(
      telegram,
      {
        platform: "telegram",
        externalId: "user-1",
        username: "artem4ik493",
        displayName: "Artem"
      },
      "Привет",
      {
        platform: "telegram",
        externalId: "user-2",
        username: "replyuser",
        displayName: "Reply User"
      }
    );

    expect(sendMessage).toHaveBeenCalledWith({
      platform: "discord",
      channelExternalId: "ds",
      response: {
        content: "\u2063\u200B\u2063[TG] @artem4ik493 в ответ на @replyuser > Привет"
      }
    });
  });

  it("marks relayed messages so they are not bridged back", async () => {
    const service = new BridgeService();
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    service.setMessageGateway({
      sendMessage
    });

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
      channelName: "general",
      communityId: "ds",
      channelId: "ds"
    });

    const request = service.createLinkRequest({
      sourceEndpointId: telegram.id,
      targetEndpointId: discord.id,
      requestedByUserId: "user-1"
    });

    await service.confirmRequest(
      request.id,
      createExecution("discord", "ds", "ds")
    );

    await service.relayMessage(
      telegram,
      {
        platform: "telegram",
        externalId: "user-1",
        displayName: "Artem"
      },
      "Привет"
    );

    const relayed =
      sendMessage.mock.calls[0]?.[0].response.content ?? "";

    expect(service.isRelayedMessage(relayed)).toBe(true);
    expect(relayed).not.toContain("MODExaBridge");
    expect(
      service.stripRelayMarker(relayed)
    ).toContain("[TG] Artem > Привет");
  });

  it("sends link success to both linked endpoints", async () => {
    const service = new BridgeService();
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    service.setMessageGateway({
      sendMessage
    });

    const source = service.registerEndpoint({
      platform: "telegram",
      communityExternalId: "tg",
      communityName: "TG",
      channelExternalId: "tg",
      channelName: "TG"
    });

    const target = service.registerEndpoint({
      platform: "discord",
      communityExternalId: "ds",
      communityName: "DS",
      channelExternalId: "ds",
      channelName: "general"
    });

    await service.sendLinkSuccess(source, target, "ru");

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "telegram",
        channelExternalId: "tg"
      })
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "discord",
        channelExternalId: "ds"
      })
    );
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
  it("blocks links when either community is private", () => {
    const communityService =
      new CommunityService();

    const telegramCommunity =
      communityService.createCommunity({
        name: "Private TG"
      });

    const discordCommunity =
      communityService.createCommunity({
        name: "Discord"
      });

    communityService.setMode(
      telegramCommunity.id,
      "private"
    );

    const service =
      new BridgeService(
        communityService
      );

    const telegram =
      service.registerEndpoint({
        platform: "telegram",
        communityExternalId: "tg",
        communityName: "Private TG",
        channelExternalId: "tg",
        channelName: "Private TG",
        communityId:
          telegramCommunity.id,
        channelId: "tg"
      });

    const discord =
      service.registerEndpoint({
        platform: "discord",
        communityExternalId: "ds",
        communityName: "Discord",
        channelExternalId: "ds",
        channelName: "general",
        communityId:
          discordCommunity.id,
        channelId: "ds"
      });

    expect(() =>
      service.createLinkRequest({
        sourceEndpointId:
          telegram.id,
        targetEndpointId:
          discord.id,
        requestedByUserId:
          "user-1"
      })
    ).toThrow(
      "Telegram community is private and cannot be linked"
    );
  });


test("removes a bridge only from the current linked community context", async () => {
  const service = new BridgeService();
  const now = new Date("2026-10-03T12:00:00.000Z");

  const telegram = service.registerEndpoint({
    platform: "telegram",
    communityExternalId: "tg-community",
    communityName: "TG",
    channelExternalId: "tg-chat",
    channelName: "general",
    communityId: "community-1",
    channelId: "channel-1"
  });

  const discord = service.registerEndpoint({
    platform: "discord",
    communityExternalId: "ds-community",
    communityName: "DS",
    channelExternalId: "ds-channel",
    channelName: "general",
    communityId: "community-2",
    channelId: "channel-2"
  });

  const request = service.createLinkRequest({
    sourceEndpointId: telegram.id,
    targetEndpointId: discord.id,
    requestedByUserId: "mx_test",
    now,
    expiresAt: new Date(now.getTime() + 60_000)
  });

  const execution = {
    platform: "discord",
    type: "community",
    user: {
      id: "mx_admin",
      displayName: "Admin"
    },
    community: {
      id: "community-2",
      name: "DS"
    },
    channel: {
      id: "channel-2",
      name: "general"
    },
    capabilities: ["community.manage"],
    locale: "ru",
    correlationId: "test"
  } as any;

  await service.confirmRequest(request.id, execution, now);
  expect(service.getLinksForCommunity("community-2")).toHaveLength(1);

  service.removeLink(
    service.getLinks()[0]!.id,
    execution,
    now
  );

  expect(service.getLinks()).toHaveLength(0);
});
});
