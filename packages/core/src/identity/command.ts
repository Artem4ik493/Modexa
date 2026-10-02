import type {
  CommandContext,
  CommandDefinition,
  CommandResponse
} from "../types.js";

import type {
  IdentityLinkService
} from "./link-service.js";

import type {
  IdentityLinkingService
} from "./linking.js";

import type {
  IdentityService
} from "./service.js";

import {
  createTranslator
} from "../i18n/translate.js";

const LINK_TTL_MS =
  10 * 60 * 1000;

function platformLabel(
  platform: "telegram" | "discord"
): string {
  return platform === "telegram"
    ? "Telegram"
    : "Discord";
}

function targetPlatform(
  platform: "telegram" | "discord"
): "telegram" | "discord" {
  return platform === "telegram"
    ? "discord"
    : "telegram";
}

export function createIdentityLinkCommand(
  identityService: IdentityService,
  linkService: IdentityLinkService,
  linkingService: IdentityLinkingService
): CommandDefinition {
  return {
    name: "link",
    aliases: [
      "linkaccount",
      "link-account"
    ],
    descriptionKey:
      "command.link.description",
    handler: (context) =>
      handleLink(
        context,
        identityService,
        linkService,
        linkingService
      )
  };
}

function handleLink(
  context: CommandContext,
  identityService: IdentityService,
  linkService: IdentityLinkService,
  linkingService: IdentityLinkingService
): CommandResponse {
  const t = createTranslator(
    context.execution.locale
  );

  if (
    context.execution.type !==
    "dm"
  ) {
    return {
      content: t(
        "identity.link.dm_only"
      )
    };
  }

  const identities =
    identityService.getUserIdentities(
      context.execution.user.id
    );

  const currentPlatform =
    context.platform;

  const target =
    targetPlatform(
      currentPlatform
    );

  if (
    identities.some(
      (identity) =>
        identity.platform ===
        target
    )
  ) {
    return {
      content: t(
        "identity.link.already_linked",
        {
          platform:
            platformLabel(target)
        }
      )
    };
  }

  const code =
    context.args[0]
      ?.trim()
      .toUpperCase();

  if (code) {
    const session =
      linkService.findByCode(code);

    if (!session) {
      return {
        content: t(
          "identity.link.invalid_code"
        )
      };
    }

    if (
      session.targetPlatform !==
      currentPlatform
    ) {
      return {
        content: t(
          "identity.link.wrong_platform",
          {
            platform:
              platformLabel(
                session.targetPlatform
              )
          }
        )
      };
    }

    if (
      session.userId ===
      context.execution.user.id
    ) {
      return {
        content: t(
          "identity.link.same_account"
        )
      };
    }

    try {
      linkingService.completeLink({
        code,
        targetPlatform:
          currentPlatform,
        targetExternalId:
          context.execution.user
            .id,
        targetDisplayName:
          context.execution.user
            .displayName,
        now: new Date()
      });

      return {
        content: t(
          "identity.link.completed",
          {
            platform:
              platformLabel(
                currentPlatform
              )
          }
        )
      };
    } catch (error) {
      if (
        error instanceof Error
      ) {
        if (
          error.message.includes(
            "already attached"
          )
        ) {
          return {
            content: t(
              "identity.link.identity_in_use"
            )
          };
        }

        if (
          error.message.includes(
            "status"
          ) ||
          error.message.includes(
            "not found"
          )
        ) {
          return {
            content: t(
              "identity.link.invalid_code"
            )
          };
        }
      }

      throw error;
    }
  }

  const session =
    linkService.createLinkSession({
      userId:
        context.execution.user.id,
      sourcePlatform:
        currentPlatform,
      targetPlatform:
        target,
      expiresAt:
        new Date(
          Date.now() +
            LINK_TTL_MS
        )
    });

  return {
    content: [
      t("identity.link.created"),
      t("identity.link.code", {
        code:
          session.code
      }),
      t("identity.link.target", {
        platform:
          platformLabel(target)
      }),
      t("identity.link.expires")
    ].join("\n")
  };
}
