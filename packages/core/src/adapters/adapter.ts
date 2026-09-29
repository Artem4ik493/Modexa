import type {
  AdapterAction
} from "./actions.js";

import type {
  AdapterEvent
} from "./events.js";

import type {
  AdapterContext,
  PlatformChannel,
  PlatformCommunity,
  PlatformUser
} from "./types.js";

export interface PlatformAdapter {
  readonly id: string;
  readonly platform: AdapterContext["platform"];

  start(): Promise<void>;

  stop(): Promise<void>;

  sendAction(
    action: AdapterAction
  ): Promise<void>;

  resolveUser(
    externalId: string
  ): Promise<PlatformUser | undefined>;

  resolveCommunity(
    externalId: string
  ): Promise<PlatformCommunity | undefined>;

  resolveChannel(
    externalId: string
  ): Promise<PlatformChannel | undefined>;

  onEvent(
    handler: (event: AdapterEvent) => void | Promise<void>
  ): void;
}