import type {
  InteractionButton,
  InteractionResponse
} from "@modexa/core";

import {
  InlineKeyboard
} from "grammy";

export function renderTelegramInteraction(
  response: InteractionResponse
): InlineKeyboard | undefined {
  const buttons =
    response.buttons ?? [];

  const menus =
    response.menus ?? [];

  const activeButtons =
    buttons.filter(
      (button) => !button.disabled
    );

  if (
    activeButtons.length === 0 &&
    menus.length === 0
  ) {
    return undefined;
  }

  const keyboard =
    new InlineKeyboard();

  for (
    let index = 0;
    index < activeButtons.length;
    index += 1
  ) {
    appendButton(
      keyboard,
      activeButtons[index]
    );

    if (
      index <
      activeButtons.length - 1
    ) {
      keyboard.row();
    }
  }

  for (
    const menu of menus
  ) {
    for (
      let index = 0;
      index < menu.options.length;
      index += 1
    ) {
      const option =
        menu.options[index];

      keyboard.text(
        option.label,
        `menu:${menu.id}:${option.value}`
      );

      if (
        index <
        menu.options.length - 1
      ) {
        keyboard.row();
      }
    }

    if (
      menu.options.length > 0 &&
      activeButtons.length > 0
    ) {
      keyboard.row();
    }
  }

  return keyboard;
}

function appendButton(
  keyboard: InlineKeyboard,
  button: InteractionButton
): void {
  switch (
    button.action.type
  ) {
    case "command":
      keyboard.text(
        button.label,
        `command:${button.id}`
      );
      break;

    case "callback":
      keyboard.text(
        button.label,
        `callback:${button.action.data}`
      );
      break;

    case "link":
      keyboard.url(
        button.label,
        button.action.url
      );
      break;
  }
}