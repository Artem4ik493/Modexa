import type {
  PlatformChannel,
  PlatformCommunity,
  PlatformUser
} from "../adapters/types.js";

import type {
  ChannelService
} from "../channels/service.js";

import type {
  Channel
} from "../channels/types.js";

import type {
  CommunityService
} from "../communities/service.js";

import type {
  Community
} from "../communities/types.js";

import type {
  Logger
} from "../diagnostics/types.js";

import type {
  IdentityService
} from "../identity/service.js";

import type {
  User
} from "../identity/types.js";

import type {
  MembershipService
} from "../memberships/service.js";

import type {
  Membership
} from "../memberships/types.js";

import type {
  Platform
} from "../types.js";

import {
  DEFAULT_CHANNEL_TYPES
} from "./context.js";

export interface PlatformIdentityServices {
  identityService: IdentityService;

  communityService: CommunityService;

  channelService: ChannelService;

  membershipService: MembershipService;
}

export interface ResolvePlatformEntitiesInput {
  platform: Platform;

  correlationId?: string;

  author: PlatformUser;

  community?: PlatformCommunity;

  channel?: PlatformChannel;
}

export interface ResolvedPlatformEntities {
  user: User;

  community?: Community;

  channel?: Channel;

  membership?: Membership;
}

/**
 * Maps platform entities (Telegram / Discord ids) to real
 * Modexa entities, creating them on first sight.
 *
 * A new platform identity always creates a NEW Modexa user.
 * Telegram and Discord accounts are never merged here:
 * linking is explicit and handled by the identity link flow.
 */
export class PlatformIdentityResolver {
  constructor(
    private readonly services: PlatformIdentityServices,
    private readonly logger?: Logger
  ) {}

  resolve(
    input: ResolvePlatformEntitiesInput
  ): ResolvedPlatformEntities {
    const user = this.resolveUser(input);

    // A DM has no community, channel or membership.
    if (!input.community) {
      return { user };
    }

    const community = this.resolveCommunity(
      input,
      input.community
    );

    const channel = input.channel
      ? this.resolveChannel(
          input,
          input.channel,
          community
        )
      : undefined;

    const membership = this.resolveMembership(
      input,
      user,
      community
    );

    return {
      user,
      community,
      channel,
      membership
    };
  }

  private resolveUser(
    input: ResolvePlatformEntitiesInput
  ): User {
    const { identityService } = this.services;

    const { author, platform } = input;

    const existing =
      identityService.findUserByIdentity(
        platform,
        author.externalId
      );

    if (existing) {
      return existing;
    }

    const user = identityService.createUser({
      displayName:
        author.displayName ??
        author.username ??
        author.externalId
    });

    identityService.attachIdentity({
      userId: user.id,
      platform,
      externalId: author.externalId,
      username: author.username,
      displayName: author.displayName
    });

    this.logger?.info(
      "identity.user.created",
      {
        correlationId: input.correlationId,
        platform,
        userId: user.id
      }
    );

    return user;
  }

  private resolveCommunity(
    input: ResolvePlatformEntitiesInput,
    external: PlatformCommunity
  ): Community {
    const { communityService } = this.services;

    const existing =
      communityService.findByIdentity(
        input.platform,
        external.externalId
      );

    if (existing) {
      return existing;
    }

    const community =
      communityService.createCommunity({
        name: external.name
      });

    communityService.attachIdentity({
      communityId: community.id,
      platform: input.platform,
      externalId: external.externalId,
      name: external.name
    });

    this.logger?.info(
      "community.created",
      {
        correlationId: input.correlationId,
        platform: input.platform,
        communityId: community.id
      }
    );

    return community;
  }

  private resolveChannel(
    input: ResolvePlatformEntitiesInput,
    external: PlatformChannel,
    community: Community
  ): Channel {
    const { channelService } = this.services;

    const existing =
      channelService.findByIdentity(
        input.platform,
        external.externalId
      );

    if (existing) {
      return existing;
    }

    const channel =
      channelService.createChannel({
        communityId: community.id,
        name: external.name,
        type: DEFAULT_CHANNEL_TYPES[
          input.platform
        ]
      });

    channelService.attachIdentity({
      channelId: channel.id,
      platform: input.platform,
      externalId: external.externalId,
      name: external.name
    });

    this.logger?.debug(
      "channel.created",
      {
        correlationId: input.correlationId,
        platform: input.platform,
        communityId: community.id,
        channelId: channel.id
      }
    );

    return channel;
  }

  private resolveMembership(
    input: ResolvePlatformEntitiesInput,
    user: User,
    community: Community
  ): Membership {
    const { membershipService } = this.services;

    const existing =
      membershipService.findMembership(
        user.id,
        community.id
      );

    if (!existing) {
      const membership =
        membershipService.createMembership({
          userId: user.id,
          communityId: community.id
        });

      this.logger?.info(
        "membership.created",
        {
          correlationId: input.correlationId,
          platform: input.platform,
          userId: user.id,
          communityId: community.id
        }
      );

      return membership;
    }

    // The user is writing again, so they are back.
    // A ban is never lifted automatically.
    if (existing.status === "left") {
      return membershipService.reactivate(
        existing.id
      );
    }

    return existing;
  }
}