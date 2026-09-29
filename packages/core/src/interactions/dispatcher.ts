import type {
  ExecutionContext
} from "../contexts/types.js";

import {
  createDiagnosticContext
} from "../diagnostics/context.js";

import type {
  Logger
} from "../diagnostics/types.js";

import type {
  CommandService
} from "../service.js";

import type {
  InteractionActionStore
} from "./action-store.js";

import type {
  BoundInteractionResponse,
  InteractionResponse,
  StoredInteractionAction
} from "./types.js";

export interface InteractionHandlerContext {
  execution: ExecutionContext;

  action: StoredInteractionAction;

  /**
   * Selected option value for menu interactions.
   */
  value?: string;
}

export type InteractionHandler = (
  context: InteractionHandlerContext
) =>
  | InteractionResponse
  | Promise<InteractionResponse>;

export interface DispatchInteractionInput {
  token: string;

  execution: ExecutionContext;

  now?: Date;
}

export type InteractionDispatchResult =
  | {
      status: "handled";
      response: BoundInteractionResponse;
    }
  | {
      status:
        | "not_found"
        | "expired"
        | "forbidden"
        | "unhandled"
        | "failed";
      message: string;
    };

const FAILURE_MESSAGES = {
  not_found:
    "This action is no longer available.",
  expired:
    "This action has expired. Please run the command again.",
  forbidden:
    "This action belongs to another user.",
  unhandled:
    "This action is not supported.",
  failed:
    "Something went wrong. Please try again."
} as const;

export class InteractionDispatcher {
  private readonly callbacks = new Map<
    string,
    InteractionHandler
  >();

  private readonly menus = new Map<
    string,
    InteractionHandler
  >();

  constructor(
    private readonly store: InteractionActionStore,
    private readonly commandService: CommandService,
    private readonly logger?: Logger
  ) {}

  registerCallback(
    data: string,
    handler: InteractionHandler
  ): void {
    this.callbacks.set(data, handler);
  }

  registerMenu(
    menuId: string,
    handler: InteractionHandler
  ): void {
    this.menus.set(menuId, handler);
  }

  async dispatch(
    input: DispatchInteractionInput
  ): Promise<InteractionDispatchResult> {
    const { execution } = input;

    const now = input.now ?? new Date();

    const diagnostics =
      createDiagnosticContext({
        correlationId:
          execution.correlationId,
        platform: execution.platform,
        userId: execution.user.id,
        communityId:
          execution.community?.id
      });

    const resolved = this.store.resolve(
      input.token,
      {
        userId: execution.user.id,
        platform: execution.platform
      },
      now
    );

    if (resolved.status !== "ok") {
      this.logger?.debug(
        "interaction.rejected",
        {
          ...diagnostics,
          reason: resolved.status
        }
      );

      return {
        status: resolved.status,
        message:
          FAILURE_MESSAGES[resolved.status]
      };
    }

    const { action } = resolved;

    this.logger?.debug(
      "interaction.resolved",
      {
        ...diagnostics,
        actionType: action.type
      }
    );

    try {
      const response =
        await this.execute(
          action,
          execution
        );

      if (!response) {
        this.logger?.debug(
          "interaction.unhandled",
          {
            ...diagnostics,
            actionType: action.type
          }
        );

        return {
          status: "unhandled",
          message:
            FAILURE_MESSAGES.unhandled
        };
      }

      return {
        status: "handled",
        response:
          this.store.bindResponse(
            response,
            {
              userId: execution.user.id,
              platform:
                execution.platform
            },
            now
          )
      };
    } catch (error) {
      this.logger?.error(
        "interaction.failed",
        {
          ...diagnostics,
          actionType: action.type
        },
        error
      );

      return {
        status: "failed",
        message: FAILURE_MESSAGES.failed
      };
    }
  }

  private async execute(
    action: StoredInteractionAction,
    execution: ExecutionContext
  ): Promise<InteractionResponse | null> {
    switch (action.type) {
      case "command": {
        const name = action.command
          .trim()
          .replace(/^\/+/, "");

        const rawText = `/${[
          name,
          ...(action.args ?? [])
        ].join(" ")}`;

        const result =
          await this.commandService.handle(
            rawText,
            {
              platform:
                execution.platform,
              user: execution.user,
              community:
                execution.community,
              channel: execution.channel,
              execution
            },
            execution
          );

        if (
          !result.handled ||
          !result.response
        ) {
          return null;
        }

        return result.response;
      }

      case "callback": {
        const handler =
          this.callbacks.get(action.data);

        if (!handler) {
          return null;
        }

        return handler({
          execution,
          action
        });
      }

      case "menu": {
        const handler =
          this.menus.get(action.menuId);

        if (!handler) {
          return null;
        }

        return handler({
          execution,
          action,
          value: action.value
        });
      }
    }
  }
}