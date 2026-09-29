import {
  describe,
  expect,
  it
} from "vitest";

import {
  ChannelService
} from "../src/channels/service.js";

describe("ChannelService", () => {
  const now = new Date(
    "2026-01-01T12:00:00.000Z"
  );

  it("creates a root Telegram channel", () => {
    const service =
      new ChannelService();

    const channel =
      service.createChannel({
        communityId: "community-1",
        name: "Main Group",
        type: "telegram_chat",
        now
      });

    expect(channel.id).toBe(
      "channel-1"
    );

    expect(channel.communityId).toBe(
      "community-1"
    );

    expect(channel.name).toBe(
      "Main Group"
    );

    expect(channel.type).toBe(
      "telegram_chat"
    );

    expect(channel.parentId).toBeUndefined();
  });

  it("creates Telegram topics under a parent chat", () => {
    const service =
      new ChannelService();

    const chat =
      service.createChannel({
        communityId: "community-1",
        name: "Community",
        type: "telegram_chat",
        now
      });

    const general =
      service.createChannel({
        communityId: "community-1",
        name: "General",
        type: "telegram_topic",
        parentId: chat.id,
        position: 1,
        now
      });

    const support =
      service.createChannel({
        communityId: "community-1",
        name: "Support",
        type: "telegram_topic",
        parentId: chat.id,
        position: 2,
        now
      });

    expect(
      general.parentId
    ).toBe(chat.id);

    expect(
      support.parentId
    ).toBe(chat.id);

    expect(
      service.getChildChannels(
        chat.id
      )
    ).toEqual([
      general,
      support
    ]);
  });

  it("creates a Discord category with child channels", () => {
    const service =
      new ChannelService();

    const category =
      service.createChannel({
        communityId: "community-1",
        name: "COMMUNITY",
        type: "discord_category",
        position: 1,
        now
      });

    const general =
      service.createChannel({
        communityId: "community-1",
        name: "general",
        type: "discord_text",
        parentId: category.id,
        position: 1,
        now
      });

    const support =
      service.createChannel({
        communityId: "community-1",
        name: "support",
        type: "discord_text",
        parentId: category.id,
        position: 2,
        now
      });

    expect(
      service.getChildChannels(
        category.id
      )
    ).toEqual([
      general,
      support
    ]);
  });

  it("supports Discord forum channels and threads", () => {
    const service =
      new ChannelService();

    const forum =
      service.createChannel({
        communityId: "community-1",
        name: "support",
        type: "discord_forum",
        now
      });

    const thread =
      service.createChannel({
        communityId: "community-1",
        name: "Issue #123",
        type: "discord_thread",
        parentId: forum.id,
        now
      });

    expect(
      thread.parentId
    ).toBe(forum.id);

    expect(
      service.getChildChannels(
        forum.id
      )
    ).toEqual([thread]);
  });

  it("does not allow a parent from another community", () => {
    const service =
      new ChannelService();

    const parent =
      service.createChannel({
        communityId: "community-1",
        name: "Category",
        type: "discord_category",
        now
      });

    expect(() => {
      service.createChannel({
        communityId: "community-2",
        name: "general",
        type: "discord_text",
        parentId: parent.id,
        now
      });
    }).toThrow(
      "Parent channel belongs to another community"
    );
  });

  it("does not allow a missing parent", () => {
    const service =
      new ChannelService();

    expect(() => {
      service.createChannel({
        communityId: "community-1",
        name: "general",
        type: "discord_text",
        parentId: "channel-999",
        now
      });
    }).toThrow(
      'Parent channel "channel-999" does not exist'
    );
  });

  it("does not allow a channel to be its own parent", () => {
    const service =
      new ChannelService();

    const channel =
      service.createChannel({
        communityId: "community-1",
        name: "general",
        type: "discord_text",
        now
      });

    expect(() => {
      service.updateChannel(
        channel.id,
        {
          parentId: channel.id,
          now
        }
      );
    }).toThrow(
      "A channel cannot be its own parent"
    );
  });

  it("updates channel metadata", () => {
    const service =
      new ChannelService();

    const channel =
      service.createChannel({
        communityId: "community-1",
        name: "general",
        type: "discord_text",
        now
      });

    const updatedAt =
      new Date(
        "2026-01-01T13:00:00.000Z"
      );

    const updated =
      service.updateChannel(
        channel.id,
        {
          name: "chat",
          position: 5,
          now: updatedAt
        }
      );

    expect(updated.name).toBe(
      "chat"
    );

    expect(updated.position).toBe(
      5
    );

    expect(updated.updatedAt).toBe(
      updatedAt
    );
  });

  it("can move a channel to another parent in the same community", () => {
    const service =
      new ChannelService();

    const firstCategory =
      service.createChannel({
        communityId: "community-1",
        name: "COMMUNITY",
        type: "discord_category",
        now
      });

    const secondCategory =
      service.createChannel({
        communityId: "community-1",
        name: "MODERATION",
        type: "discord_category",
        now
      });

    const channel =
      service.createChannel({
        communityId: "community-1",
        name: "reports",
        type: "discord_text",
        parentId: firstCategory.id,
        now
      });

    const updated =
      service.updateChannel(
        channel.id,
        {
          parentId: secondCategory.id,
          now
        }
      );

    expect(
      updated.parentId
    ).toBe(secondCategory.id);

    expect(
      service.getChildChannels(
        firstCategory.id
      )
    ).toHaveLength(0);

    expect(
      service.getChildChannels(
        secondCategory.id
      )
    ).toEqual([updated]);
  });

  it("can detach a channel from its parent", () => {
    const service =
      new ChannelService();

    const category =
      service.createChannel({
        communityId: "community-1",
        name: "COMMUNITY",
        type: "discord_category",
        now
      });

    const channel =
      service.createChannel({
        communityId: "community-1",
        name: "general",
        type: "discord_text",
        parentId: category.id,
        now
      });

    const updated =
      service.updateChannel(
        channel.id,
        {
          parentId: null,
          now
        }
      );

    expect(
      updated.parentId
    ).toBeUndefined();
  });

  it("returns community channels ordered by position", () => {
    const service =
      new ChannelService();

    const third =
      service.createChannel({
        communityId: "community-1",
        name: "third",
        type: "telegram_topic",
        position: 3,
        now
      });

    const first =
      service.createChannel({
        communityId: "community-1",
        name: "first",
        type: "telegram_topic",
        position: 1,
        now
      });

    const second =
      service.createChannel({
        communityId: "community-1",
        name: "second",
        type: "telegram_topic",
        position: 2,
        now
      });

    expect(
      service.getCommunityChannels(
        "community-1"
      )
    ).toEqual([
      first,
      second,
      third
    ]);
  });

  it("attaches a Telegram channel identity", () => {
    const service =
      new ChannelService();

    const channel =
      service.createChannel({
        communityId: "community-1",
        name: "Main",
        type: "telegram_chat",
        now
      });

    const identity =
      service.attachIdentity({
        channelId: channel.id,
        platform: "telegram",
        externalId: "-100123456789",
        name: "Main",
        now
      });

    expect(identity.id).toBe(
      "channel-identity-1"
    );

    expect(identity.platform).toBe(
      "telegram"
    );

    expect(identity.externalId).toBe(
      "-100123456789"
    );

    expect(
      service.findByIdentity(
        "telegram",
        "-100123456789"
      )
    ).toBe(channel);
  });

  it("attaches a Discord channel identity", () => {
    const service =
      new ChannelService();

    const channel =
      service.createChannel({
        communityId: "community-1",
        name: "general",
        type: "discord_text",
        now
      });

    service.attachIdentity({
      channelId: channel.id,
      platform: "discord",
      externalId: "123456789",
      name: "general",
      now
    });

    expect(
      service.findByIdentity(
        "discord",
        "123456789"
      )
    ).toBe(channel);
  });

  it("does not allow one external channel identity on two channels", () => {
    const service =
      new ChannelService();

    const first =
      service.createChannel({
        communityId: "community-1",
        name: "general",
        type: "discord_text",
        now
      });

    const second =
      service.createChannel({
        communityId: "community-1",
        name: "support",
        type: "discord_text",
        now
      });

    service.attachIdentity({
      channelId: first.id,
      platform: "discord",
      externalId: "123456789",
      now
    });

    expect(() => {
      service.attachIdentity({
        channelId: second.id,
        platform: "discord",
        externalId: "123456789",
        now
      });
    }).toThrow(
      'Channel identity "discord:123456789" is already attached to another channel'
    );
  });

  it("returns the existing identity when attaching it to the same channel", () => {
    const service =
      new ChannelService();

    const channel =
      service.createChannel({
        communityId: "community-1",
        name: "general",
        type: "discord_text",
        now
      });

    const first =
      service.attachIdentity({
        channelId: channel.id,
        platform: "discord",
        externalId: "123456789",
        now
      });

    const second =
      service.attachIdentity({
        channelId: channel.id,
        platform: "discord",
        externalId: "123456789",
        now
      });

    expect(second).toBe(first);
  });

  it("returns all identities belonging to a channel", () => {
    const service =
      new ChannelService();

    const channel =
      service.createChannel({
        communityId: "community-1",
        name: "general",
        type: "discord_text",
        now
      });

    service.attachIdentity({
      channelId: channel.id,
      platform: "discord",
      externalId: "discord-123",
      now
    });

    service.attachIdentity({
      channelId: channel.id,
      platform: "telegram",
      externalId: "telegram-123",
      now
    });

    expect(
      service.getChannelIdentities(
        channel.id
      )
    ).toHaveLength(2);
  });

  it("does not allow deleting a channel with children", () => {
    const service =
      new ChannelService();

    const category =
      service.createChannel({
        communityId: "community-1",
        name: "COMMUNITY",
        type: "discord_category",
        now
      });

    service.createChannel({
      communityId: "community-1",
      name: "general",
      type: "discord_text",
      parentId: category.id,
      now
    });

    expect(() => {
      service.deleteChannel(
        category.id
      );
    }).toThrow(
      `Channel "${category.id}" cannot be deleted while it has child channels`
    );
  });

  it("deletes a channel and its identities", () => {
    const service =
      new ChannelService();

    const channel =
      service.createChannel({
        communityId: "community-1",
        name: "general",
        type: "discord_text",
        now
      });

    service.attachIdentity({
      channelId: channel.id,
      platform: "discord",
      externalId: "123456789",
      now
    });

    service.deleteChannel(
      channel.id
    );

    expect(
      service.getChannel(channel.id)
    ).toBeUndefined();

    expect(
      service.findByIdentity(
        "discord",
        "123456789"
      )
    ).toBeUndefined();
  });
});