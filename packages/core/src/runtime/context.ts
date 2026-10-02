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

const DEFAULT_CHANNEL_TYPES: Record<
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
}

/**
 * Builds an execution context from platform data.
 *
 * Until real Modexa identities are wired in, ids are
 * synthetic: "<platform>:<externalId>".
 *
 * The locale comes from the author's platform locale code.
 * Missing or unsupported codes fall back to the default.
 */
export function createPlatformExecutionContext(
  service: ExecutionContextService,
  input: PlatformContextInput
): ExecutionContext {
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

    locale: resolveLocale(
      input.author.locale
    )
  });
}