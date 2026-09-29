import type {
  ExecutionContext,
  ExecutionContextService,
  PlatformChannel,
  PlatformCommunity,
  PlatformUser
} from "@modexa/core";

export interface TelegramContextInput {
  correlationId: string;

  author: PlatformUser;

  community?: PlatformCommunity;

  channel?: PlatformChannel;
}

export function createTelegramExecutionContext(
  service: ExecutionContextService,
  input: TelegramContextInput
): ExecutionContext {
  const now = new Date();

  const user = {
    id: `telegram:${input.author.externalId}`,

    displayName:
      input.author.displayName ??
      input.author.username ??
      input.author.externalId,

    createdAt: now,

    updatedAt: now
  };

  const community = input.community
    ? {
        id: `telegram:${input.community.externalId}`,

        name: input.community.name,

        createdAt: now,

        updatedAt: now
      }
    : undefined;

  const channel = input.channel
    ? {
        id: `telegram:${input.channel.externalId}`,

        communityId:
          community?.id ??
          `telegram:${input.channel.externalId}`,

        name: input.channel.name,

        type: "telegram_chat" as const,

        createdAt: now,

        updatedAt: now
      }
    : undefined;

  return service.create({
    platform: "telegram",

    correlationId: input.correlationId,

    user,

    community,

    channel
  });
}