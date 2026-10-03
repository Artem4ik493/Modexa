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
    requiredCapabilities: [
      "identity.link"
    ],
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
        "link.error.dm_only"
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
        "link.error.linked",
        {
          platform:
            platformLabel(target)
        }
      )
    };
  }

  const currentIdentity =
    identities.find(
      (identity) =>
        identity.platform ===
        currentPlatform
    );

  if (!currentIdentity) {
    return {
      content: t(
        "link.error.identity_unavailable"
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
          "link.error.invalid_code"
        )
      };
    }

    if (
      session.targetPlatform !==
      currentPlatform
    ) {
      return {
        content: t(
          "link.error.wrong_platform",
          {
            platform:
              platformLabel(
                session.targetPlatform
              )
          }
        )
      };
    }

    try {
      linkingService.completeLink({
        code,
        targetExternalId:
          currentIdentity.externalId,
        targetUsername:
          currentIdentity.username,
        targetDisplayName:
          currentIdentity.displayName,
        now: new Date()
      });

      return {
        content: t(
          "link.success.completed",
          {
            platform:
              platformLabel(
                currentPlatform
              )
          }
        ),
        buttons: [
          {
            id: "link-account",
            label: t("account.open"),
            action: {
              type: "command",
              command: "/account"
            }
          },
          {
            id: "link-menu",
            label: t("menu.back"),
            action: {
              type: "command",
              command: "/menu"
            }
          }
        ]
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
              "link.error.identity_in_use"
            )
          };
        }

        if (
          error.message.includes(
            "status"
          ) ||
          error.message.includes(
            "not found"
          ) ||
          error.message.includes(
            "intended for"
          )
        ) {
          return {
            content: t(
              "link.error.invalid_code"
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
      t("link.success.created"),
      t("link.target", {
        platform:
          platformLabel(target)
      }),
      t("link.command", {
        code:
          session.code
      }),
      t("link.expires")
    ].join("\n"),
    format: "markdown",
    buttons: [
      {
        id: "link-account",
        label: t("account.open"),
        action: {
          type: "command",
          command: "/account"
        }
      },
      {
        id: "link-menu",
        label: t("menu.back"),
        action: {
          type: "command",
          command: "/menu"
        }
      }
    ]
  };
}
