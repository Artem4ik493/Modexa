import type { Channel } from "../channels/types.js";
import type { Community } from "../communities/types.js";
import type { Platform } from "../types.js";
import type { User } from "../identity/types.js";

export type AdapterId = string;

export interface PlatformUser {
  platform: Platform;
  externalId: string;
  username?: string;
  displayName?: string;

  /**
   * Language code reported by the platform, for example
   * "ru", "en-US" or "uk". Mapped to a supported Modexa
   * locale with resolveLocale().
   */
  locale?: string;
}

export interface PlatformCommunity {
  platform: Platform;
  externalId: string;
  name: string;
}

export interface PlatformChannel {
  platform: Platform;
  externalId: string;
  name: string;
}

export interface AdapterContext {
  platform: Platform;
  adapterId: AdapterId;
}

export interface ResolvedUser {
  user: User;
  external: PlatformUser;
}

export interface ResolvedCommunity {
  community: Community;
  external: PlatformCommunity;
}

export interface ResolvedChannel {
  channel: Channel;
  external: PlatformChannel;
}