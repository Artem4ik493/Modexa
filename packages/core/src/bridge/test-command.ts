import type {
  CommandContext,
  CommandDefinition,
  CommandResponse
} from "../types.js";

import type {
  InteractionHandlerContext
} from "../interactions/dispatcher.js";

import type {
  InteractionResponse
} from "../interactions/types.js";

import {
  createTranslator
} from "../i18n/translate.js";

import type {
  IdentityPlatform
} from "../identity/types.js";

import type {
  IdentityService
} from "../identity/service.js";

import type {
  CommunityService
} from "../communities/service.js";

import type {
  BridgeService
} from "./service.js";

import type {
  BridgeEndpoint
} from "./types.js";

const PAGE_SIZE = 20;
const CLOSE_ACTION = "bridge.test.close";

type BridgeSelectionScope =
  | "any"
  | "account";

function endpointLabel(
  endpoint: BridgeEndpoint
): string {
  return [
    endpoint.platform === "telegram"
      ? "TG"
      : "DS",
    endpoint.communityName,
    `#${endpoint.channelName}`
  ].join(" · ");
}

function targetPlatform(
  source: BridgeEndpoint
): IdentityPlatform {
  return source.platform === "telegram"
    ? "discord"
    : "telegram";
}

function getSourceEndpoint(
  bridgeService: BridgeService,
  context: CommandContext
): BridgeEndpoint | undefined {
  return bridgeService.findEndpointForExecution(
    context.execution
  );
}

function hasLinkedAccounts(
  identityService: IdentityService,
  userId: string
): boolean {
  const platforms = new Set(
    identityService
      .getUserIdentities(userId)
      .map((identity) => identity.platform)
  );

  return (
    platforms.has("telegram") &&
    platforms.has("discord")
  );
}

function getTargetEndpoints(
  bridgeService: BridgeService,
  source: BridgeEndpoint
): BridgeEndpoint[] {
  return bridgeService
    .listEndpoints(targetPlatform(source))
    .filter(
      (endpoint) =>
        endpoint.id !== source.id &&
        !bridgeService.isLinked(
          source.id,
          endpoint.id
        ) &&
        !bridgeService.isEndpointPrivate(
          endpoint
        )
    );
}

function closeButton(
  t: ReturnType<typeof createTranslator>
): {
  id: string;
  label: string;
  action: {
    type: "callback";
    data: string;
  };
} {
  return {
    id: "bridge-close",
    label: t("bridge.test.close"),
    action: {
      type: "callback",
      data: CLOSE_ACTION
    }
  };
}

function backButton(
  t: ReturnType<typeof createTranslator>,
  data: string
): {
  id: string;
  label: string;
  action: {
    type: "callback";
    data: string;
  };
} {
  return {
    id: "bridge-back",
    label: t("bridge.test.back"),
    action: {
      type: "callback",
      data
    }
  };
}

function buildScopeResponse(
  locale?: "ru" | "en"
): CommandResponse {
  const t = createTranslator(locale);

  return {
    content: t("bridge.test.title"),
    buttons: [
      {
        id: "bridge-scope-any",
        label: t("bridge.test.scope.any"),
        action: {
          type: "callback",
          data: "bridge.test.scope:any"
        }
      },
      {
        id: "bridge-scope-account",
        label: t("bridge.test.scope.account"),
        action: {
          type: "callback",
          data: "bridge.test.scope:account"
        }
      },
      {
        id: "bridge-back-menu",
        label: t("menu.back"),
        action: {
          type: "command",
          command: "/menu"
        }
      },
      closeButton(t)
    ]
  };
}

function buildCommunityResponse(
  bridgeService: BridgeService,
  source: BridgeEndpoint,
  scope: BridgeSelectionScope,
  page: number,
  locale?: "ru" | "en"
): CommandResponse {
  const t = createTranslator(locale);
  const endpoints =
    getTargetEndpoints(
      bridgeService,
      source
    );

  if (endpoints.length === 0) {
    return {
      content:
        source.platform === "telegram"
          ? t("bridge.test.no_communities.discord")
          : t("bridge.test.no_communities.telegram"),
      buttons: [
        backButton(t, "bridge.test.back:scope"),
        closeButton(t)
      ]
    };
  }

  const communities = new Map<
    string,
    {
      platform: IdentityPlatform;
      externalId: string;
      name: string;
    }
  >();

  for (const endpoint of endpoints) {
    const key = [
      endpoint.platform,
      endpoint.communityExternalId
    ].join(":");

    if (!communities.has(key)) {
      communities.set(key, {
        platform: endpoint.platform,
        externalId:
          endpoint.communityExternalId,
        name: endpoint.communityName
      });
    }
  }

  const values = [...communities.values()];
  const pageCount = Math.max(
    1,
    Math.ceil(values.length / PAGE_SIZE)
  );
  const safePage = Math.min(
    Math.max(page, 0),
    pageCount - 1
  );

  const current = values.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE
  );

  const buttons = current.map(
    (community) => ({
      id:
        `bridge-community-${community.externalId}`,
      label:
        community.name,
      action: {
        type: "callback" as const,
        data:
          `bridge.test.community:${scope}:${community.platform}:${community.externalId}:${safePage}`
      }
    })
  );

  if (safePage > 0) {
    buttons.push({
      id: "bridge-community-prev",
      label: t("bridge.test.previous"),
      action: {
        type: "callback" as const,
        data:
          `bridge.test.communities:${scope}:${safePage - 1}`
      }
    });
  }

  if (safePage < pageCount - 1) {
    buttons.push({
      id: "bridge-community-next",
      label: t("bridge.test.next"),
      action: {
        type: "callback" as const,
        data:
          `bridge.test.communities:${scope}:${safePage + 1}`
      }
    });
  }

  buttons.push(
    backButton(t, "bridge.test.back:scope"),
    closeButton(t)
  );

  return {
    content: [
      t("bridge.test.communities.title"),
      t("bridge.test.page", {
        page: safePage + 1,
        total: pageCount
      })
    ].join("\n"),
    buttons
  };
}

function buildChannelResponse(
  bridgeService: BridgeService,
  source: BridgeEndpoint,
  scope: BridgeSelectionScope,
  communityPlatform: IdentityPlatform,
  communityExternalId: string,
  communityPage: number,
  page: number,
  locale?: "ru" | "en"
): CommandResponse {
  const t = createTranslator(locale);

  const endpoints =
    getTargetEndpoints(
      bridgeService,
      source
    ).filter(
      (endpoint) =>
        endpoint.platform ===
          communityPlatform &&
        endpoint.communityExternalId ===
          communityExternalId
    );

  if (endpoints.length === 0) {
    return {
      content: t("bridge.test.no_chats"),
      buttons: [
        backButton(
          t,
          `bridge.test.communities:${scope}:${communityPage}`
        ),
        closeButton(t)
      ]
    };
  }

  const pageCount = Math.max(
    1,
    Math.ceil(endpoints.length / PAGE_SIZE)
  );
  const safePage = Math.min(
    Math.max(page, 0),
    pageCount - 1
  );
  const current = endpoints.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE
  );

  const buttons = current.map((endpoint) => ({
      id:
        `bridge-select-${endpoint.id}`,
      label:
        endpoint.platform === "telegram"
          ? endpoint.channelName
          : `#${endpoint.channelName}`,
      action: {
        type: "callback" as const,
        data:
          `bridge.test.select:${endpoint.id}`
      }
    }));

  if (safePage > 0) {
    buttons.push({
      id: "bridge-channel-prev",
      label: t("bridge.test.previous"),
      action: {
        type: "callback" as const,
        data:
          `bridge.test.channels:${scope}:${communityPlatform}:${communityExternalId}:${communityPage}:${safePage - 1}`
      }
    });
  }

  if (safePage < pageCount - 1) {
    buttons.push({
      id: "bridge-channel-next",
      label: t("bridge.test.next"),
      action: {
        type: "callback" as const,
        data:
          `bridge.test.channels:${scope}:${communityPlatform}:${communityExternalId}:${communityPage}:${safePage + 1}`
      }
    });
  }

  buttons.push(
    backButton(
      t,
      `bridge.test.communities:${scope}:${communityPage}`
    ),
    closeButton(t)
  );

  return {
    content: [
      t("bridge.test.channels.title"),
      endpoints[0].communityName,
      t("bridge.test.page", {
        page: safePage + 1,
        total: pageCount
      })
    ].join("\n"),
    buttons
  };
}

function createHandler(
  bridgeService: BridgeService,
  identityService: IdentityService,
  context: CommandContext
): CommandResponse {
  const t = createTranslator(
    context.execution.locale
  );

  if (
    context.execution.type !==
    "community"
  ) {
    return {
      content: t(
        "bridge.test.community_only"
      )
    };
  }

  if (
    !context.execution.capabilities.includes(
      "community.manage"
    )
  ) {
    return {
      content: t(
        "bridge.test.forbidden"
      )
    };
  }

  if (
    !hasLinkedAccounts(
      identityService,
      context.execution.user.id
    )
  ) {
    return {
      content: t(
        "bridge.test.no_accounts"
      )
    };
  }

  const source =
    getSourceEndpoint(
      bridgeService,
      context
    );

  if (!source) {
    return {
      content: t(
        "bridge.test.source_unknown"
      )
    };
  }

  if (
    bridgeService.isEndpointPrivate(
      source
    )
  ) {
    return {
      content: t(
        source.platform === "telegram"
          ? "bridge.test.private_source.telegram"
          : "bridge.test.private_source.discord"
      )
    };
  }

  if (
    getTargetEndpoints(
      bridgeService,
      source
    ).length === 0
  ) {
    return {
      content: t(
        "bridge.test.no_chats"
      )
    };
  }

  return buildScopeResponse(
    context.execution.locale
  );
}

export function createBridgeTestCommand(
  bridgeService: BridgeService,
  identityService: IdentityService
): CommandDefinition {
  return {
    name: "bridge-test",
    aliases: ["bridgetest"],
    descriptionKey:
      "command.bridge_test.description",
    handler: (context) =>
      createHandler(
        bridgeService,
        identityService,
        context
      )
  };
}

export function createBridgeTestInteractionHandler(
  bridgeService: BridgeService
): (
  context: InteractionHandlerContext
) => Promise<InteractionResponse> | InteractionResponse {
  return async (context) => {
    const data =
      context.action.type ===
      "callback"
        ? context.action.data
        : "";

    const t = createTranslator(
      context.execution.locale
    );

    if (data === CLOSE_ACTION) {
      return {
        content: "",
        buttons: []
      };
    }

    if (data === "bridge.test.back:scope") {
      return buildScopeResponse(
        context.execution.locale
      );
    }

    if (
      data.startsWith(
        "bridge.test.scope:"
      )
    ) {
      const scope =
        data.slice(
          "bridge.test.scope:".length
        ) as BridgeSelectionScope;

      if (
        scope !== "any" &&
        scope !== "account"
      ) {
        return {
          content: t(
            "bridge.test.endpoint_unavailable"
          )
        };
      }

      const source =
        bridgeService.findEndpointForExecution(
          context.execution
        );

      if (!source) {
        return {
          content: t(
            "bridge.test.source_unknown"
          )
        };
      }

      return buildCommunityResponse(
        bridgeService,
        source,
        scope,
        0,
        context.execution.locale
      );
    }

    if (
      data.startsWith(
        "bridge.test.communities:"
      )
    ) {
      const parts =
        data
          .slice(
            "bridge.test.communities:".length
          )
          .split(":");

      const scope =
        parts[0] as BridgeSelectionScope;
      const page =
        Number(parts[1]);

      const source =
        bridgeService.findEndpointForExecution(
          context.execution
        );

      if (
        !source ||
        (scope !== "any" &&
          scope !== "account") ||
        !Number.isInteger(page)
      ) {
        return {
          content: t(
            "bridge.test.page_unavailable"
          )
        };
      }

      return buildCommunityResponse(
        bridgeService,
        source,
        scope,
        page,
        context.execution.locale
      );
    }

    if (
      data.startsWith(
        "bridge.test.channels:"
      )
    ) {
      const parts = data.slice("bridge.test.channels:".length).split(":");
      const scope = parts[0] as BridgeSelectionScope;
      const platform = parts[1] as IdentityPlatform;
      const communityExternalId = parts[2];
      const communityPage = Number(parts[3]);
      const page = Number(parts[4]);
      const source = bridgeService.findEndpointForExecution(context.execution);

      if (
        !source ||
        (scope !== "any" && scope !== "account") ||
        (platform !== "telegram" && platform !== "discord") ||
        !communityExternalId ||
        !Number.isInteger(communityPage) ||
        !Number.isInteger(page)
      ) {
        return { content: t("bridge.test.page_unavailable") };
      }

      return buildChannelResponse(
        bridgeService,
        source,
        scope,
        platform,
        communityExternalId,
        communityPage,
        page,
        context.execution.locale
      );
    }

    if (
      data.startsWith(
        "bridge.test.community:"
      )
    ) {
      const parts =
        data
          .slice(
            "bridge.test.community:".length
          )
          .split(":");

      const scope =
        parts[0] as BridgeSelectionScope;
      const platform =
        parts[1] as IdentityPlatform;
      const communityPage = Number(parts[parts.length - 1]);
      const communityExternalId =
        parts.slice(2, -1).join(":");

      const source =
        bridgeService.findEndpointForExecution(
          context.execution
        );

      if (
        !source ||
        (scope !== "any" &&
          scope !== "account") ||
        (platform !== "telegram" &&
          platform !== "discord") ||
        !communityExternalId ||
        !Number.isInteger(communityPage)
      ) {
        return {
          content: t(
            "bridge.test.endpoint_unavailable"
          )
        };
      }

      const targetEndpoints =
        getTargetEndpoints(
          bridgeService,
          source
        ).filter(
          (endpoint) =>
            endpoint.platform ===
              platform &&
            endpoint.communityExternalId ===
              communityExternalId
        );

      if (
        targetEndpoints.length === 0
      ) {
        return {
          content: t(
            "bridge.test.no_chats"
          )
        };
      }

      const privateTarget =
        targetEndpoints.some(
          (endpoint) =>
            bridgeService.isEndpointPrivate(
              endpoint
            )
        );

      if (privateTarget) {
        return {
          content: t(
            platform === "telegram"
              ? "bridge.test.private_target.telegram"
              : "bridge.test.private_target.discord"
          )
        };
      }

      return buildChannelResponse(
        bridgeService,
        source,
        scope,
        platform,
        communityExternalId,
        communityPage,
        0,
        context.execution.locale
      );
    }

    if (
      data.startsWith(
        "bridge.test.select:"
      )
    ) {
      const targetId =
        data.slice(
          "bridge.test.select:".length
        );

      const source =
        bridgeService.findEndpointForExecution(
          context.execution
        );

      const target =
        bridgeService.getEndpoint(
          targetId
        );

      if (!source || !target) {
        return {
          content: t(
            "bridge.test.endpoint_unavailable"
          )
        };
      }

      if (
        bridgeService.isEndpointPrivate(
          target
        )
      ) {
        return {
          content: t(
            target.platform === "telegram"
              ? "bridge.test.private_target.telegram"
              : "bridge.test.private_target.discord"
          )
        };
      }

      let request;

      try {
        request =
          bridgeService.createLinkRequest({
            sourceEndpointId:
              source.id,
            targetEndpointId:
              target.id,
            requestedByUserId:
              context.execution.user.id
          });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(
            "private"
          )
        ) {
          return {
            content: t(
              target.platform ===
                "telegram"
                ? "bridge.test.private_target.telegram"
                : "bridge.test.private_target.discord"
            )
          };
        }

        throw error;
      }

      try {
        await bridgeService.sendConfirmation(
          request,
          context.execution.locale ??
            "ru"
        );
      } catch (error) {
        bridgeService.cancelRequest(
          request.id
        );

        throw error;
      }

      return {
        content: t(
          "bridge.test.request_sent",
          {
            target:
              endpointLabel(target)
          }
        )
      };
    }

    if (
      data.startsWith(
        "bridge.test.confirm:"
      )
    ) {
      const requestId =
        data.slice(
          "bridge.test.confirm:".length
        );

      const result =
        await bridgeService.confirmRequest(
          requestId,
          context.execution
        );

      await bridgeService.sendLinkSuccess(
        result.source,
        result.target,
        context.execution.locale ??
          "ru"
      );

      return {
        content: t(
          "bridge.test.confirmed"
        )
      };
    }

    if (
      data.startsWith(
        "bridge.test.reject:"
      )
    ) {
      const requestId =
        data.slice(
          "bridge.test.reject:".length
        );

      bridgeService.rejectRequest(
        requestId,
        context.execution
      );

      return {
        content: t(
          "bridge.test.rejected"
        )
      };
    }

    return {
      content: t(
        "bridge.test.unknown_action"
      )
    };
  };
}
