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
  BridgeService
} from "./service.js";
import type {
  BridgeEndpoint
} from "./types.js";

const PAGE_SIZE = 20;

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

function getSourceEndpoint(
  bridgeService: BridgeService,
  context: CommandContext
): BridgeEndpoint | undefined {
  return bridgeService.findEndpointForExecution(
    context.execution
  );
}

function buildSelectionResponse(
  bridgeService: BridgeService,
  source: BridgeEndpoint,
  page: number,
  locale?: "ru" | "en"
): CommandResponse {
  const t = createTranslator(
    locale
  );

  const targets =
    bridgeService
      .listEndpoints(
        source.platform ===
          "telegram"
          ? "discord"
          : "telegram"
      )
      .filter(
        (endpoint) =>
          endpoint.id !== source.id &&
          !bridgeService.isLinked(
            source.id,
            endpoint.id
          )
      );

  const pageCount = Math.max(
    1,
    Math.ceil(
      targets.length /
        PAGE_SIZE
    )
  );

  const safePage = Math.min(
    Math.max(page, 0),
    pageCount - 1
  );

  const current =
    targets.slice(
      safePage * PAGE_SIZE,
      (safePage + 1) *
        PAGE_SIZE
    );

  const buttons = current.map(
    (endpoint) => ({
      id:
        `bridge-select-${endpoint.id}`,
      label:
        endpointLabel(endpoint),
      action: {
        type: "callback" as const,
        data:
          `bridge.test.select:${endpoint.id}`
      }
    })
  );

  if (safePage > 0) {
    buttons.push({
      id: "bridge-prev",
      label: t("bridge.test.previous"),
      action: {
        type: "callback" as const,
        data:
          `bridge.test.page:${source.id}:${safePage - 1}`
      }
    });
  }

  if (safePage < pageCount - 1) {
    buttons.push({
      id: "bridge-next",
      label: t("bridge.test.next"),
      action: {
        type: "callback" as const,
        data:
          `bridge.test.page:${source.id}:${safePage + 1}`
      }
    });
  }

  return {
    content: [
      t("bridge.test.title"),
      t("bridge.test.source", {
        platform:
          source.platform ===
          "telegram"
            ? "Telegram"
            : "Discord",
        community:
          source.communityName,
        channel:
          source.channelName
      }),
      t("bridge.test.page", {
        page:
          safePage + 1,
        total:
          pageCount
      })
    ].join("\n"),
    buttons
  };
}

function createHandler(
  bridgeService: BridgeService,
  context: CommandContext
): Promise<CommandResponse> | CommandResponse {
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

  const hasTargets =
    bridgeService
      .listEndpoints(
        source.platform ===
          "telegram"
          ? "discord"
          : "telegram"
      )
      .some(
        (endpoint) =>
          endpoint.id !== source.id &&
          !bridgeService.isLinked(
            source.id,
            endpoint.id
          )
      );

  if (!hasTargets) {
    return {
      content: t(
        "bridge.test.no_targets"
      )
    };
  }

  return buildSelectionResponse(
    bridgeService,
    source,
    0,
    context.execution.locale
  );
}

export function createBridgeTestCommand(
  bridgeService: BridgeService
): CommandDefinition {
  return {
    name: "bridge-test",
    aliases: ["bridgetest"],
    descriptionKey:
      "command.bridge_test.description",
    handler: (context) =>
      createHandler(
        bridgeService,
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

    if (
      data.startsWith(
        "bridge.test.page:"
      )
    ) {
      const pageData =
        data.slice(
          "bridge.test.page:"
            .length
        );

      const separator =
        pageData.lastIndexOf(":");

      const sourceId =
        separator >= 0
          ? pageData.slice(
              0,
              separator
            )
          : pageData;

      const pageText =
        separator >= 0
          ? pageData.slice(
              separator + 1
            )
          : "";

      const source =
        bridgeService.getEndpoint(
          sourceId
        );

      const page =
        Number(pageText);

      if (
        !source ||
        !Number.isInteger(page)
      ) {
        return {
          content: createTranslator(
            context.execution.locale
          )("bridge.test.page_unavailable")
        };
      }

      return buildSelectionResponse(
        bridgeService,
        source,
        page,
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
          "bridge.test.select:"
            .length
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
          content: createTranslator(
            context.execution.locale
          )("bridge.test.endpoint_unavailable")
        };
      }

      const request =
        bridgeService.createLinkRequest({
          sourceEndpointId:
            source.id,
          targetEndpointId:
            target.id,
          requestedByUserId:
            context.execution.user.id
        });

      try {
        await bridgeService.sendConfirmation(
          request,
          context.execution.locale ?? "ru"
        );
      } catch (error) {
        bridgeService.cancelRequest(
          request.id
        );

        throw error;
      }

      return {
        content: createTranslator(
          context.execution.locale
        )("bridge.test.request_sent", {
          target: endpointLabel(target)
        })
      };
    }

    if (
      data.startsWith(
        "bridge.test.confirm:"
      )
    ) {
      const requestId =
        data.slice(
          "bridge.test.confirm:"
            .length
        );

      const result =
        await bridgeService.confirmRequest(
          requestId,
          context.execution
        );

      await bridgeService.sendLinkSuccess(
        result.source,
        result.target,
        context.execution.locale ?? "ru"
      );

      return {
        content: createTranslator(
          context.execution.locale
        )("bridge.test.confirmed")
      };
    }

    if (
      data.startsWith(
        "bridge.test.reject:"
      )
    ) {
      const requestId =
        data.slice(
          "bridge.test.reject:"
            .length
        );

      bridgeService.rejectRequest(
        requestId,
        context.execution
      );

      return {
        content:
          "Запрос на привязку отклонён."
      };
    }

    return {
      content: createTranslator(
        context.execution.locale
      )("bridge.test.unknown_action")
    };
  };
}
