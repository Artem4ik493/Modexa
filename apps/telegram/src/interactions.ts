import type {
  BoundInteractionResponse
} from "@modexa/core";

import {
  InlineKeyboard
} from "grammy";

export const TELEGRAM_CALLBACK_PREFIX =
  "mx:";

export const TELEGRAM_CALLBACK_DATA_MAX_BYTES =
  64;

export function createTelegramCallbackData(
  token: string
): string {
  const data =
    `${TELEGRAM_CALLBACK_PREFIX}${token}`;

  const bytes =
    new TextEncoder().encode(data)
      .length;

  if (
    bytes >
    TELEGRAM_CALLBACK_DATA_MAX_BYTES
  ) {
    throw new Error(
      "Telegram callback_data exceeds 64-byte limit"
    );
  }

  return data;
}

export function parseTelegramCallbackData(
  data: string | undefined
): string | undefined {
  if (
    !data ||
    !data.startsWith(
      TELEGRAM_CALLBACK_PREFIX
    )
  ) {
    return undefined;
  }

  const token = data.slice(
    TELEGRAM_CALLBACK_PREFIX.length
  );

  return token.length > 0
    ? token
    : undefined;
}

type KeyboardItem =
  | {
      label: string;
      url: string;
    }
  | {
      label: string;
      callbackData: string;
    };

export function renderTelegramInteraction(
  response: BoundInteractionResponse
): InlineKeyboard | undefined {
  const items: KeyboardItem[] = [];

  for (const button of response.buttons ?? []) {
    if (button.disabled) {
      continue;
    }

    if (button.action.type === "link") {
      items.push({
        label: button.label,
        url: button.action.url
      });

      continue;
    }

    if (!button.token) {
      throw new Error(
        `Interaction button has no token: ${button.id}`
      );
    }

    items.push({
      label: button.label,
      callbackData:
        createTelegramCallbackData(
          button.token
        )
    });
  }

  for (const menu of response.menus ?? []) {
    for (const option of menu.options) {
      items.push({
        label: option.label,
        callbackData:
          createTelegramCallbackData(
            option.token
          )
      });
    }
  }

  if (items.length === 0) {
    return undefined;
  }

  const keyboard =
    new InlineKeyboard();

  items.forEach((item, index) => {
    if (index > 0) {
      keyboard.row();
    }

    if ("url" in item) {
      keyboard.url(
        item.label,
        item.url
      );
    } else {
      keyboard.text(
        item.label,
        item.callbackData
      );
    }
  });

  return keyboard;
}