import type {
  PlatformChannel,
  PlatformCommunity,
  PlatformUser
} from "../adapters/types.js";

import type {
  ChannelType
} from "../channels/types.js";

import type {
  ExecutionContextService
} from "../contexts/service.js";

import type {
  ExecutionContext
} from "../contexts/types.js";

import {
  resolveLocale
} from "../i18n/locale.js";

import type {
  Platform
} from "../types.js";

import type {
  ResolvedPlatformEntities
} from "./identity.js";

export const DEFAULT_CHANNEL_TYPES: Record<
  Platform,
  ChannelType
> = {
  telegram: "telegram_chat",
  discord: "discord_text"
};

export interface PlatformContextInput {
  platform: Platform;

  correlationId: string;

  author: PlatformUser;

  community?: PlatformCommunity;

  channel?: PlatformChannel;

  /**
   * Real Modexa entities resolved from the platform data.
   * When omitted, synthetic ids are used:
   * "<platform>:<externalId>".
   */
  resolved?: ResolvedPlatformEntities;
}

/**
 * Builds an execution context from platform data.
 *
 * With `resolved`, the context carries real Modexa users,
 * communities and channels. Without it, ids are synthetic.
 *
 * The locale comes from the author's platform locale code.
 * Missing or unsupported codes fall back to the default.
 */
export function createPlatformExecutionContext(
  service: ExecutionContextService,
  input: PlatformContextInput
): ExecutionContext {
  const locale = resolveLocale(
    input.author.locale
  );

  if (input.resolved) {
    return service.create({
      platform: input.platform,

      correlationId: input.correlationId,

      user: input.resolved.user,

      community: input.resolved.community,

      channel: input.resolved.channel,

      locale
    });
  }

  const prefix = `${input.platform}:`;

  const now = new Date();

  const user = {
    id: `${prefix}${input.author.externalId}`,

    displayName:
      input.author.displayName ??
      input.author.username ??
      input.author.externalId,

    createdAt: now,

    updatedAt: now
  };

  const community = input.community
    ? {
        id: `${prefix}${input.community.externalId}`,

        name: input.community.name,

        createdAt: now,

        updatedAt: now
      }
    : undefined;

  const channel = input.channel
    ? {
        id: `${prefix}${input.channel.externalId}`,

        communityId:
          community?.id ??
          `${prefix}${input.channel.externalId}`,

        name: input.channel.name,

        type: DEFAULT_CHANNEL_TYPES[
          input.platform
        ],

        createdAt: now,

        updatedAt: now
      }
    : undefined;

  return service.create({
    platform: input.platform,

    correlationId: input.correlationId,

    user,

    community,

    channel,

    locale
  });
}