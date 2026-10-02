import type {
  ExecutionContext
} from "../contexts/types.js";
import type { IdentityPlatform } from "../identity/types.js";
import type { Locale } from "../i18n/locale.js";
import { translate } from "../i18n/translate.js";
import type {
  InteractionResponse
} from "../interactions/types.js";
import type {
  BridgeEndpoint,
  BridgeLink,
  BridgeLinkRequest,
  BridgeEndpointId
} from "./types.js";

export interface BridgeMessageGateway {
  sendMessage(input: {
    platform: IdentityPlatform;
    channelExternalId: string;
    response: InteractionResponse;
  }): Promise<void>;
}

export interface CreateBridgeLinkRequestInput {
  sourceEndpointId: BridgeEndpointId;
  targetEndpointId: BridgeEndpointId;
  requestedByUserId: string;
  now?: Date;
  expiresAt?: Date;
}

export class BridgeService {
  private readonly endpoints = new Map<
    BridgeEndpointId,
    BridgeEndpoint
  >();

  private readonly requests = new Map<
    string,
    BridgeLinkRequest
  >();

  private readonly links = new Map<
    string,
    BridgeLink
  >();

  private nextRequestId = 1;
  private nextLinkId = 1;
  private gateway?: BridgeMessageGateway;

  setMessageGateway(
    gateway: BridgeMessageGateway
  ): void {
    this.gateway = gateway;
  }

  registerEndpoint(
    endpoint: Omit<BridgeEndpoint, "id" | "updatedAt"> & {
      id?: string;
      updatedAt?: Date;
    }
  ): BridgeEndpoint {
    const id =
      endpoint.id ??
      this.createEndpointId(
        endpoint.platform,
        endpoint.communityExternalId,
        endpoint.channelExternalId
      );

    const existing =
      this.endpoints.get(id);

    if (existing) {
      existing.communityName =
        endpoint.communityName;
      existing.channelName =
        endpoint.channelName;
      existing.communityId =
        endpoint.communityId ??
        existing.communityId;
      existing.channelId =
        endpoint.channelId ??
        existing.channelId;
      existing.updatedAt =
        endpoint.updatedAt ??
        new Date();

      return existing;
    }

    const created: BridgeEndpoint = {
      ...endpoint,
      id,
      updatedAt:
        endpoint.updatedAt ??
        new Date()
    };

    this.endpoints.set(
      created.id,
      created
    );

    return created;
  }

  listEndpoints(
    platform?: IdentityPlatform
  ): BridgeEndpoint[] {
    return [
      ...this.endpoints.values()
    ]
      .filter(
        (endpoint) =>
          !platform ||
          endpoint.platform === platform
      )
      .sort(
        (a, b) =>
          a.platform.localeCompare(b.platform) ||
          a.communityName.localeCompare(
            b.communityName
          ) ||
          a.channelName.localeCompare(
            b.channelName
          )
      );
  }

  getEndpoint(
    endpointId: BridgeEndpointId
  ): BridgeEndpoint | undefined {
    return this.endpoints.get(endpointId);
  }

  findEndpointForExecution(
    execution: ExecutionContext
  ): BridgeEndpoint | undefined {
    if (
      !execution.community ||
      !execution.channel
    ) {
      return undefined;
    }

    for (const endpoint of this.endpoints.values()) {
      if (
        endpoint.platform ===
          execution.platform &&
        endpoint.communityId ===
          execution.community.id &&
        endpoint.channelId ===
          execution.channel.id
      ) {
        return endpoint;
      }
    }

    return undefined;
  }

  getRequest(
    requestId: string,
    now = new Date()
  ): BridgeLinkRequest | undefined {
    const request =
      this.requests.get(requestId);

    if (!request) {
      return undefined;
    }

    this.expireIfNeeded(
      request,
      now
    );

    return request;
  }

  getRequestById(
    requestId: string
  ): BridgeLinkRequest | undefined {
    return this.requests.get(
      requestId
    );
  }

  getLinks(): BridgeLink[] {
    return [
      ...this.links.values()
    ];
  }

  createLinkRequest(
    input: CreateBridgeLinkRequestInput
  ): BridgeLinkRequest {
    const now =
      input.now ?? new Date();

    const source =
      this.getEndpoint(
        input.sourceEndpointId
      );

    const target =
      this.getEndpoint(
        input.targetEndpointId
      );

    if (!source || !target) {
      throw new Error(
        "Bridge endpoint does not exist"
      );
    }

    if (
      source.platform ===
      target.platform
    ) {
      throw new Error(
        "Bridge test currently supports only Telegram to Discord links"
      );
    }

    if (
      source.id === target.id
    ) {
      throw new Error(
        "Bridge endpoints must be different"
      );
    }

    if (
      this.isLinked(
        source.id,
        target.id
      )
    ) {
      throw new Error(
        "These bridge endpoints are already linked"
      );
    }

    const pending =
      [...this.requests.values()]
        .find(
          (request) =>
            request.status ===
              "pending" &&
            request.sourceEndpointId ===
              source.id &&
            request.targetEndpointId ===
              target.id
        );

    if (pending) {
      throw new Error(
        "A bridge confirmation is already pending for these endpoints"
      );
    }

    const expiresAt =
      input.expiresAt ??
      new Date(
        now.getTime() +
          10 * 60 * 1000
      );

    if (expiresAt <= now) {
      throw new Error(
        "Bridge link request expiration must be in the future"
      );
    }

    const request: BridgeLinkRequest = {
      id:
        `bridge-request-${this.nextRequestId++}`,
      sourceEndpointId:
        source.id,
      targetEndpointId:
        target.id,
      requestedByUserId:
        input.requestedByUserId,
      status: "pending",
      expiresAt,
      createdAt: now,
      updatedAt: now
    };

    this.requests.set(
      request.id,
      request
    );

    return request;
  }

  async confirmRequest(
    requestId: string,
    execution: ExecutionContext,
    now = new Date()
  ): Promise<{
    request: BridgeLinkRequest;
    link: BridgeLink;
    source: BridgeEndpoint;
    target: BridgeEndpoint;
  }> {
    const request =
      this.getRequest(
        requestId,
        now
      );

    if (!request) {
      throw new Error(
        "Bridge link request not found"
      );
    }

    if (
      request.status !==
      "pending"
    ) {
      throw new Error(
        `Bridge link request cannot be confirmed because its status is "${request.status}"`
      );
    }

    const target =
      this.getEndpoint(
        request.targetEndpointId
      );

    const source =
      this.getEndpoint(
        request.sourceEndpointId
      );

    if (!source || !target) {
      throw new Error(
        "Bridge endpoint no longer exists"
      );
    }

    const current =
      this.findEndpointForExecution(
        execution
      );

    if (
      !current ||
      current.id !== target.id
    ) {
      throw new Error(
        "Bridge confirmation must be performed in the target chat"
      );
    }

    if (
      !execution.capabilities.includes(
        "community.manage"
      )
    ) {
      throw new Error(
        "Bridge confirmation requires community.manage permission"
      );
    }

    request.status =
      "confirmed";
    request.updatedAt = now;

    const link: BridgeLink = {
      id:
        `bridge-link-${this.nextLinkId++}`,
      sourceEndpointId:
        source.id,
      targetEndpointId:
        target.id,
      createdAt: now,
      updatedAt: now
    };

    this.links.set(
      link.id,
      link
    );

    return {
      request,
      link,
      source,
      target
    };
  }

  rejectRequest(
    requestId: string,
    execution: ExecutionContext,
    now = new Date()
  ): BridgeLinkRequest {
    const request =
      this.getRequest(
        requestId,
        now
      );

    if (!request) {
      throw new Error(
        "Bridge link request not found"
      );
    }

    if (
      request.status !==
      "pending"
    ) {
      throw new Error(
        `Bridge link request cannot be rejected because its status is "${request.status}"`
      );
    }

    const target =
      this.getEndpoint(
        request.targetEndpointId
      );

    const current =
      this.findEndpointForExecution(
        execution
      );

    if (
      !target ||
      !current ||
      current.id !== target.id
    ) {
      throw new Error(
        "Bridge rejection must be performed in the target chat"
      );
    }

    if (
      !execution.capabilities.includes(
        "community.manage"
      )
    ) {
      throw new Error(
        "Bridge rejection requires community.manage permission"
      );
    }

    request.status =
      "rejected";
    request.updatedAt = now;

    return request;
  }

  cancelRequest(
    requestId: string,
    now = new Date()
  ): BridgeLinkRequest {
    const request = this.getRequest(requestId, now);

    if (!request) {
      throw new Error("Bridge link request not found");
    }

    if (request.status !== "pending") {
      throw new Error(
        `Bridge link request cannot be cancelled because its status is "${request.status}"`
      );
    }

    request.status = "cancelled";
    request.updatedAt = now;

    return request;
  }

  isLinked(
    firstEndpointId: BridgeEndpointId,
    secondEndpointId: BridgeEndpointId
  ): boolean {
    return [
      ...this.links.values()
    ].some(
      (link) =>
        (link.sourceEndpointId ===
          firstEndpointId &&
          link.targetEndpointId ===
            secondEndpointId) ||
        (link.sourceEndpointId ===
          secondEndpointId &&
          link.targetEndpointId ===
            firstEndpointId)
    );
  }

  async sendConfirmation(
    request: BridgeLinkRequest,
    locale: Locale = "ru"
  ): Promise<void> {
    if (!this.gateway) {
      throw new Error(
        "Bridge message gateway is not configured"
      );
    }

    const target =
      this.getEndpoint(
        request.targetEndpointId
      );

    const source =
      this.getEndpoint(
        request.sourceEndpointId
      );

    if (!target || !source) {
      throw new Error(
        "Bridge endpoint no longer exists"
      );
    }

    await this.gateway.sendMessage({
      platform:
        target.platform,
      channelExternalId:
        target.channelExternalId,
      response: {
        content:
          `Запрос на привязку\n\n${source.platform === "telegram" ? "Telegram" : "Discord"}: ${source.communityName} / ${source.channelName}\n\nПодтвердите создание связи с этим чатом.`,
        buttons: [
          {
            id: "bridge-confirm",
            label: translate("bridge.test.confirm", undefined, locale),
            action: {
              type: "callback",
              data:
                `bridge.test.confirm:${request.id}`
            }
          },
          {
            id: "bridge-reject",
            label: translate("bridge.test.reject", undefined, locale),
            action: {
              type: "callback",
              data:
                `bridge.test.reject:${request.id}`
            }
          }
        ]
      }
    });
  }

  async sendLinkSuccess(
    source: BridgeEndpoint,
    target: BridgeEndpoint,
    locale: Locale = "ru"
  ): Promise<void> {
    if (!this.gateway) {
      throw new Error(
        "Bridge message gateway is not configured"
      );
    }

    const message = {
      content:
        `Bridge подключён!\n\n${source.platform === "telegram" ? "Telegram" : "Discord"}: ${source.communityName} / ${source.channelName}\n${target.platform === "telegram" ? "Telegram" : "Discord"}: ${target.communityName} / ${target.channelName}\n\nСвязка работает.`,
      buttons: []
    };

    await this.gateway.sendMessage({
      platform:
        source.platform,
      channelExternalId:
        source.channelExternalId,
      response: message
    });
  }

  private createEndpointId(
    platform: IdentityPlatform,
    communityExternalId: string,
    channelExternalId: string
  ): string {
    return [
      platform,
      communityExternalId,
      channelExternalId
    ].join(":");
  }

  private expireIfNeeded(
    request: BridgeLinkRequest,
    now: Date
  ): void {
    if (
      request.status ===
        "pending" &&
      request.expiresAt <= now
    ) {
      request.status =
        "expired";
      request.updatedAt = now;
    }
  }
}
