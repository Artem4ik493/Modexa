import {
  createPlatformEventHandler,
  type AdapterEvent,
  type PlatformEventHandlerDeps
} from "@modexa/core";

import {
  renderDiscordInteraction
} from "./interactions.js";

export type DiscordEventHandlerDeps =
  Omit<
    PlatformEventHandlerDeps,
    "platform" | "renderMetadata"
  >;

export function createDiscordEventHandler(
  deps: DiscordEventHandlerDeps
): (
  event: AdapterEvent
) => Promise<void> {
  return createPlatformEventHandler({
    ...deps,

    platform: "discord",

    renderMetadata: (response) => {
      const components =
        renderDiscordInteraction(response);

      return components
        ? { discord: { components } }
        : undefined;
    }
  });
}