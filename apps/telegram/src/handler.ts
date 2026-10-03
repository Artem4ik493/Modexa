import {
  createPlatformEventHandler,
  type AdapterEvent,
  type PlatformEventHandlerDeps
} from "@modexa/core";

import {
  renderTelegramInteraction
} from "./interactions.js";

export type TelegramEventHandlerDeps =
  Omit<
    PlatformEventHandlerDeps,
    "platform" | "renderMetadata"
  >;

export function createTelegramEventHandler(
  deps: TelegramEventHandlerDeps
): (
  event: AdapterEvent
) => Promise<void> {
  return createPlatformEventHandler({
    ...deps,

    platform: "telegram",

    renderMetadata: (response) => {
      const replyMarkup =
        renderTelegramInteraction(response);

      if (!replyMarkup && !response.imageUrl) {
        return undefined;
      }

      return {
        telegram: {
          ...(replyMarkup ? { replyMarkup } : {}),
          ...(response.imageUrl
            ? { imageUrl: response.imageUrl }
            : {})
        }
      };
    }
  });
}