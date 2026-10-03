import type {
  ExecutionContext
} from "../contexts/types.js";
import type {
  PlatformUser
} from "../adapters/types.js";
import type { IdentityPlatform } from "../identity/types.js";
import type { Locale } from "../i18n/locale.js";
import { translate } from "../i18n/translate.js";
import type {
  InteractionResponse
} from "../interactions/types.js";
import type {
  CommunityService
} from "../communities/service.js";

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

const BRIDGE_RELAY_MARKER = "\u2063\u200B\u2063";

export interface CreateBridgeLinkRequestInput {
  sourceEndpointId: BridgeEndpointId;
  targetEndpointId: BridgeEndpointId;
  requestedByUserId: string;
  now?: Date;
  expiresAt?: Date;
}

export class BridgeService {
  constructor(
    private readonly communityService?: CommunityService
  ) {}
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
        existing.communityId ??
        this.communityService
          ?.findByIdentity(
            endpoint.platform,
            endpoint.communityExternalId
          )
          ?.id;
      existing.channelId =
        endpoint.channelId ??
        existing.channelId;
      existing.updatedAt =
        endpoint.updatedAt ??
        new Date();

      return existing;
    }

    const resolvedCommunityId =
      endpoint.communityId ??
      this.communityService
        ?.findByIdentity(
          endpoint.platform,
          endpoint.communityExternalId
        )
        ?.id;

    const created: BridgeEndpoint = {
      ...endpoint,
      communityId: resolvedCommunityId,
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

  getLinksForCommunity(
    communityId: string
  ): Array<{
    link: BridgeLink;
    first: BridgeEndpoint;
    second: BridgeEndpoint;
  }> {
    return [...this.links.values()]
      .map((link) => {
        const first =
          this.getEndpoint(
            link.sourceEndpointId
          );
        const second =
          this.getEndpoint(
            link.targetEndpointId
          );

        if (!first || !second) {
          return undefined;
        }

        if (
          first.communityId !== communityId &&
          second.communityId !== communityId
        ) {
          return undefined;
        }

        return {
          link,
          first,
          second
        };
      })
      .filter(
        (
          item
        ): item is {
          link: BridgeLink;
          first: BridgeEndpoint;
          second: BridgeEndpoint;
        } => item !== undefined
      );
  }

  removeLink(
    linkId: BridgeLinkId,
    execution: ExecutionContext,
    now = new Date()
  ): BridgeLink {
    const link =
      this.links.get(linkId);

    if (!link) {
      throw new Error(
        "Bridge link not found"
      );
    }

    if (
      !execution.capabilities.includes(
        "community.manage"
      )
    ) {
      throw new Error(
        "Bridge removal requires community.manage permission"
      );
    }

    const current =
      this.findEndpointForExecution(
        execution
      );

    const first =
      this.getEndpoint(
        link.sourceEndpointId
      );
    const second =
      this.getEndpoint(
        link.targetEndpointId
      );

    if (!current || !first || !second) {
      throw new Error(
        "Bridge endpoint is unavailable"
      );
    }

    if (
      current.id !== first.id &&
      current.id !== second.id
    ) {
      throw new Error(
        "Bridge removal must be performed in one of the linked chats"
      );
    }

    this.links.delete(linkId);

    const updated =
      new Date(now);

    link.updatedAt = updated;

    return link;
  }

  getLinkedEndpoints(
    endpointId: BridgeEndpointId
  ): BridgeEndpoint[] {
    const targetIds =
      new Set<BridgeEndpointId>();

    for (const link of this.links.values()) {
      if (link.sourceEndpointId === endpointId) {
        targetIds.add(link.targetEndpointId);
      }

      if (link.targetEndpointId === endpointId) {
        targetIds.add(link.sourceEndpointId);
      }
    }

    return [...targetIds]
      .map((id) => this.getEndpoint(id))
      .filter(
        (endpoint): endpoint is BridgeEndpoint =>
          endpoint !== undefined
      );
  }

  isRelayedMessage(
    content: string
  ): boolean {
    return content.startsWith(
      BRIDGE_RELAY_MARKER
    );
  }

  stripRelayMarker(
    content: string
  ): string {
    return content.startsWith(
      BRIDGE_RELAY_MARKER
    )
      ? content.slice(
          BRIDGE_RELAY_MARKER.length
        )
      : content;
  }

  async relayMessage(
    source: BridgeEndpoint,
    author: PlatformUser,
    content: string,
    replyTo?: PlatformUser
  ): Promise<void> {
    if (!this.gateway || !content.trim()) {
      return;
    }

    const targets =
      this.getLinkedEndpoints(source.id);

    if (targets.length === 0) {
      return;
    }

    const prefix =
      source.platform === "telegram"
        ? "[TG]"
        : "[DS]";

    const name =
      author.username
        ? "@" + author.username
        : author.displayName ??
          author.externalId;

    const replyName = replyTo
      ? replyTo.username
        ? "@" + replyTo.username
        : replyTo.displayName ??
          replyTo.externalId
      : undefined;

    const response: InteractionResponse = {
      content:
        BRIDGE_RELAY_MARKER +
        prefix +
        " " +
        name +
        (replyName
          ? " в ответ на " + replyName
          : "") +
        " > " +
        content
    };

    await Promise.all(
      targets.map((target) =>
        this.gateway!.sendMessage({
          platform: target.platform,
          channelExternalId: target.channelExternalId,
          response
        })
      )
    );
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
      this.isEndpointPrivate(source)
    ) {
      throw new Error(
        source.platform === "telegram"
          ? "Telegram community is private and cannot be linked"
          : "Discord server is private and cannot be linked"
      );
    }

    if (
      this.isEndpointPrivate(target)
    ) {
      throw new Error(
        target.platform === "telegram"
          ? "Telegram group is private and cannot be linked"
          : "Discord server is private and cannot be linked"
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
        content: translate(
          "bridge.test.confirmation",
          {
            source: `${source.platform === "telegram" ? "Telegram" : "Discord"}: ${source.communityName} / ${source.channelName}`
          },
          locale
        ),
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
      content: translate(
        "bridge.test.success",
        {
          source: `${source.platform === "telegram" ? "Telegram" : "Discord"}: ${source.communityName} / ${source.channelName}`,
          target: `${target.platform === "telegram" ? "Telegram" : "Discord"}: ${target.communityName} / ${target.channelName}`
        },
        locale
      ),
      buttons: []
    };

    await Promise.all([
      this.gateway.sendMessage({
        platform:
          source.platform,
        channelExternalId:
          source.channelExternalId,
        response: message
      }),
      this.gateway.sendMessage({
        platform:
          target.platform,
        channelExternalId:
          target.channelExternalId,
        response: message
      })
    ]);
  }

  isEndpointPrivate(
    endpoint: BridgeEndpoint
  ): boolean {
    if (!this.communityService) {
      return false;
    }

    const community =
      endpoint.communityId
        ? this.communityService.getCommunity(
            endpoint.communityId
          )
        : this.communityService.findByIdentity(
            endpoint.platform,
            endpoint.communityExternalId
          );

    return community?.mode === "private";
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
