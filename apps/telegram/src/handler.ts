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

      if (!replyMarkup && !response.imageUrl && !response.embed) {
        return undefined;
      }

      return {
        telegram: {
          ...(replyMarkup ? { replyMarkup } : {}),
          ...(response.media ? { media: response.media } : {}),
          ...(response.imageUrl
            ? { imageUrl: response.imageUrl }
            : {}),
          ...(response.embed ? { embed: response.embed } : {}),
          ...(response.format === "markdown"
            ? { parseMode: "Markdown" }
            : {})
        }
      };
    }
  });
}