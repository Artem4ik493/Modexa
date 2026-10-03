import type {
  BoundInteractionButton,
  BoundInteractionMenu,
  BoundInteractionResponse,
  InteractionResponse,
  StoredInteractionAction
} from "./types.js";

export const DEFAULT_INTERACTION_TTL_MS =
  60 * 60 * 1000;

export interface InteractionActionScope {
  /**
   * When set, only this user can use the token.
   */
  userId?: string;

  platform: string;
}

export interface CreateInteractionTokenInput {
  action: StoredInteractionAction;

  scope: InteractionActionScope;

  ttlMs?: number;

  now?: Date;
}

export interface InteractionRequester {
  userId: string;

  platform: string;
}

export type ResolveInteractionTokenResult =
  | {
      status: "ok";
      action: StoredInteractionAction;
    }
  | {
      status:
        | "not_found"
        | "expired"
        | "forbidden";
    };

interface StoredEntry {
  action: StoredInteractionAction;

  userId?: string;

  platform: string;

  expiresAt: number;
}

export interface InteractionActionStoreOptions {
  ttlMs?: number;
}

export class InteractionActionStore {
  private readonly entries = new Map<
    string,
    StoredEntry
  >();

  private readonly ttlMs: number;

  constructor(
    options: InteractionActionStoreOptions = {}
  ) {
    this.ttlMs =
      options.ttlMs ??
      DEFAULT_INTERACTION_TTL_MS;
  }

  get size(): number {
    return this.entries.size;
  }

  create(
    input: CreateInteractionTokenInput
  ): string {
    const now = (
      input.now ?? new Date()
    ).getTime();

    this.prune(now);

    const token = this.generateToken();

    this.entries.set(token, {
      action: input.action,
      userId: input.scope.userId,
      platform: input.scope.platform,
      expiresAt:
        now + (input.ttlMs ?? this.ttlMs)
    });

    return token;
  }

  resolve(
    token: string,
    requester: InteractionRequester,
    now: Date = new Date()
  ): ResolveInteractionTokenResult {
    const entry =
      this.entries.get(token);

    if (!entry) {
      return { status: "not_found" };
    }

    if (entry.expiresAt <= now.getTime()) {
      this.entries.delete(token);

      return { status: "expired" };
    }

    if (
      entry.platform !==
        requester.platform ||
      (entry.userId !== undefined &&
        entry.userId !== requester.userId)
    ) {
      return { status: "forbidden" };
    }

    return {
      status: "ok",
      action: entry.action
    };
  }

  bindResponse(
    response: InteractionResponse,
    scope: InteractionActionScope,
    now: Date = new Date()
  ): BoundInteractionResponse {
    const buttons: BoundInteractionButton[] | undefined =
      response.buttons?.map((button) => {
        if (
          button.disabled ||
          button.action.type === "link"
        ) {
          return { ...button };
        }

        const action: StoredInteractionAction =
          button.action.type === "command"
            ? {
                type: "command",
                command:
                  button.action.command,
                args: button.action.args
              }
            : {
                type: "callback",
                data: button.action.data
              };

        return {
          ...button,
          token: this.create({
            action,
            scope,
            now
          })
        };
      });

    const menus: BoundInteractionMenu[] | undefined =
      response.menus?.map((menu) => ({
        ...menu,
        options: menu.options.map(
          (option) => ({
            ...option,
            token: this.create({
              action: {
                type: "menu",
                menuId: menu.id,
                value: option.value
              },
              scope,
              now
            })
          })
        )
      }));

    return {
      content: response.content,
      ...(response.imageUrl
        ? { imageUrl: response.imageUrl }
        : {}),
      buttons,
      menus,
      ...(response.close
        ? { close: true }
        : {})
    };
  }

  private prune(nowMs: number): void {
    for (const [token, entry] of this.entries) {
      if (entry.expiresAt <= nowMs) {
        this.entries.delete(token);
      }
    }
  }

  private generateToken(): string {
    let token: string;

    do {
      token = crypto
        .randomUUID()
        .replace(/-/g, "")
        .slice(0, 12);
    } while (this.entries.has(token));

    return token;
  }
}