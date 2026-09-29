import type {
  CommunityId,
  CommunityPlatform
} from "../communities/types.js";

import type {
  Channel,
  ChannelIdentity,
  ChannelIdentityId,
  ChannelId,
  ChannelType
} from "./types.js";

export interface CreateChannelInput {
  communityId: CommunityId;
  name: string;
  type: ChannelType;
  parentId?: ChannelId;
  position?: number;
  now?: Date;
}

export interface AttachChannelIdentityInput {
  channelId: ChannelId;
  platform: CommunityPlatform;
  externalId: string;
  name?: string;
  now?: Date;
}

export class ChannelService {
  private readonly channels = new Map<
    ChannelId,
    Channel
  >();

  private readonly identities = new Map<
    ChannelIdentityId,
    ChannelIdentity
  >();

  private readonly identityIndex = new Map<
    string,
    ChannelIdentityId
  >();

  private nextChannelId = 1;
  private nextIdentityId = 1;

  createChannel(
    input: CreateChannelInput
  ): Channel {
    if (
      input.parentId !== undefined &&
      !this.channels.has(input.parentId)
    ) {
      throw new Error(
        `Parent channel "${input.parentId}" does not exist`
      );
    }

    if (
      input.parentId !== undefined
    ) {
      const parent =
        this.channels.get(input.parentId);

      if (
        parent &&
        parent.communityId !== input.communityId
      ) {
        throw new Error(
          "Parent channel belongs to another community"
        );
      }
    }

    const now = input.now ?? new Date();

    const channel: Channel = {
      id: `channel-${this.nextChannelId++}`,
      communityId: input.communityId,
      parentId: input.parentId,
      name: input.name,
      type: input.type,
      position: input.position,
      createdAt: now,
      updatedAt: now
    };

    this.channels.set(
      channel.id,
      channel
    );

    return channel;
  }

  getChannel(
    channelId: ChannelId
  ): Channel | undefined {
    return this.channels.get(channelId);
  }

  getCommunityChannels(
    communityId: CommunityId
  ): Channel[] {
    return [...this.channels.values()]
      .filter(
        (channel) =>
          channel.communityId === communityId
      )
      .sort(
        (a, b) =>
          (a.position ?? 0) -
          (b.position ?? 0)
      );
  }

  getChildChannels(
    parentId: ChannelId
  ): Channel[] {
    return [...this.channels.values()]
      .filter(
        (channel) =>
          channel.parentId === parentId
      )
      .sort(
        (a, b) =>
          (a.position ?? 0) -
          (b.position ?? 0)
      );
  }

  updateChannel(
    channelId: ChannelId,
    input: {
      name?: string;
      parentId?: ChannelId | null;
      position?: number;
      now?: Date;
    }
  ): Channel {
    const channel =
      this.channels.get(channelId);

    if (!channel) {
      throw new Error(
        `Channel "${channelId}" does not exist`
      );
    }

    if (
      input.parentId !== undefined &&
      input.parentId !== null
    ) {
      const parent =
        this.channels.get(input.parentId);

      if (!parent) {
        throw new Error(
          `Parent channel "${input.parentId}" does not exist`
        );
      }

      if (
        parent.communityId !==
        channel.communityId
      ) {
        throw new Error(
          "Parent channel belongs to another community"
        );
      }

      if (
        parent.id === channel.id
      ) {
        throw new Error(
          "A channel cannot be its own parent"
        );
      }
    }

    const now = input.now ?? new Date();

    if (input.name !== undefined) {
      channel.name = input.name;
    }

    if (input.parentId !== undefined) {
      channel.parentId =
        input.parentId === null
          ? undefined
          : input.parentId;
    }

    if (input.position !== undefined) {
      channel.position =
        input.position;
    }

    channel.updatedAt = now;

    return channel;
  }

  deleteChannel(
    channelId: ChannelId
  ): void {
    const channel =
      this.channels.get(channelId);

    if (!channel) {
      throw new Error(
        `Channel "${channelId}" does not exist`
      );
    }

    const children =
      this.getChildChannels(channelId);

    if (children.length > 0) {
      throw new Error(
        `Channel "${channelId}" cannot be deleted while it has child channels`
      );
    }

    const identities =
      this.getChannelIdentities(channelId);

    for (const identity of identities) {
      this.identities.delete(
        identity.id
      );

      this.identityIndex.delete(
        this.getIdentityKey(
          identity.platform,
          identity.externalId
        )
      );
    }

    this.channels.delete(channelId);
  }

  attachIdentity(
    input: AttachChannelIdentityInput
  ): ChannelIdentity {
    const channel =
      this.channels.get(input.channelId);

    if (!channel) {
      throw new Error(
        `Channel "${input.channelId}" does not exist`
      );
    }

    const identityKey =
      this.getIdentityKey(
        input.platform,
        input.externalId
      );

    const existingIdentityId =
      this.identityIndex.get(
        identityKey
      );

    if (existingIdentityId) {
      const existingIdentity =
        this.identities.get(
          existingIdentityId
        );

      if (existingIdentity) {
        if (
          existingIdentity.channelId ===
          input.channelId
        ) {
          return existingIdentity;
        }

        throw new Error(
          `Channel identity "${input.platform}:${input.externalId}" is already attached to another channel`
        );
      }
    }

    const now = input.now ?? new Date();

    const identity: ChannelIdentity = {
      id: `channel-identity-${this.nextIdentityId++}`,
      channelId: input.channelId,
      platform: input.platform,
      externalId: input.externalId,
      name: input.name,
      createdAt: now,
      updatedAt: now
    };

    this.identities.set(
      identity.id,
      identity
    );

    this.identityIndex.set(
      identityKey,
      identity.id
    );

    channel.updatedAt = now;

    return identity;
  }

  findByIdentity(
    platform: CommunityPlatform,
    externalId: string
  ): Channel | undefined {
    const identityId =
      this.identityIndex.get(
        this.getIdentityKey(
          platform,
          externalId
        )
      );

    if (!identityId) {
      return undefined;
    }

    const identity =
      this.identities.get(identityId);

    if (!identity) {
      return undefined;
    }

    return this.channels.get(
      identity.channelId
    );
  }

  getChannelIdentities(
    channelId: ChannelId
  ): ChannelIdentity[] {
    return [
      ...this.identities.values()
    ].filter(
      (identity) =>
        identity.channelId === channelId
    );
  }

  getCommunityChannelIdentities(
    communityId: CommunityId
  ): ChannelIdentity[] {
    const channelIds = new Set(
      this.getCommunityChannels(
        communityId
      ).map(
        (channel) => channel.id
      )
    );

    return [
      ...this.identities.values()
    ].filter(
      (identity) =>
        channelIds.has(identity.channelId)
    );
  }

  private getIdentityKey(
    platform: CommunityPlatform,
    externalId: string
  ): string {
    return `${platform}:${externalId}`;
  }
}