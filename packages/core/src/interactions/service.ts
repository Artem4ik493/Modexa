import type {
  InteractionButton,
  InteractionMenu,
  InteractionRequest,
  InteractionResponse
} from "./types.js";

export class InteractionService {
  createResponse(
    content?: string
  ): InteractionResponse {
    return {
      content
    };
  }

  withButtons(
    response: InteractionResponse,
    buttons: InteractionButton[]
  ): InteractionResponse {
    return {
      ...response,
      buttons: [...buttons]
    };
  }

  withMenus(
    response: InteractionResponse,
    menus: InteractionMenu[]
  ): InteractionResponse {
    return {
      ...response,
      menus: [...menus]
    };
  }

  validateResponse(
    response: InteractionResponse
  ): void {
    if (
      response.content === undefined &&
      (!response.buttons ||
        response.buttons.length === 0) &&
      (!response.menus ||
        response.menus.length === 0)
    ) {
      throw new Error(
        "Interaction response must contain content, buttons, or menus"
      );
    }

    this.validateButtons(
      response.buttons ?? []
    );

    this.validateMenus(
      response.menus ?? []
    );
  }

  validateRequest(
    request: InteractionRequest
  ): void {
    if (!request.id.trim()) {
      throw new Error(
        "Interaction request id is required"
      );
    }

    if (!request.actionId.trim()) {
      throw new Error(
        "Interaction action id is required"
      );
    }

    if (!request.userId.trim()) {
      throw new Error(
        "Interaction user id is required"
      );
    }

    if (!request.platform.trim()) {
      throw new Error(
        "Interaction platform is required"
      );
    }
  }

  private validateButtons(
    buttons: InteractionButton[]
  ): void {
    const ids =
      new Set<string>();

    for (const button of buttons) {
      if (!button.id.trim()) {
        throw new Error(
          "Interaction button id is required"
        );
      }

      if (ids.has(button.id)) {
        throw new Error(
          `Duplicate interaction button id: ${button.id}`
        );
      }

      ids.add(button.id);

      if (!button.label.trim()) {
        throw new Error(
          `Interaction button label is required: ${button.id}`
        );
      }

      if (
        button.action.type ===
        "command"
      ) {
        if (
          !button.action.command.trim()
        ) {
          throw new Error(
            `Interaction button command is required: ${button.id}`
          );
        }

        continue;
      }

      if (
        button.action.type ===
        "link"
      ) {
        if (
          !button.action.url.trim()
        ) {
          throw new Error(
            `Interaction button URL is required: ${button.id}`
          );
        }

        continue;
      }

      if (
        !button.action.data.trim()
      ) {
        throw new Error(
          `Interaction button callback data is required: ${button.id}`
        );
      }
    }
  }

  private validateMenus(
    menus: InteractionMenu[]
  ): void {
    const ids =
      new Set<string>();

    for (const menu of menus) {
      if (!menu.id.trim()) {
        throw new Error(
          "Interaction menu id is required"
        );
      }

      if (ids.has(menu.id)) {
        throw new Error(
          `Duplicate interaction menu id: ${menu.id}`
        );
      }

      ids.add(menu.id);

      if (
        menu.options.length === 0
      ) {
        throw new Error(
          `Interaction menu must contain options: ${menu.id}`
        );
      }

      const optionValues =
        new Set<string>();

      for (
        const option of menu.options
      ) {
        if (!option.value.trim()) {
          throw new Error(
            `Interaction menu option value is required: ${menu.id}`
          );
        }

        if (
          optionValues.has(
            option.value
          )
        ) {
          throw new Error(
            `Duplicate interaction menu option value: ${option.value}`
          );
        }

        optionValues.add(
          option.value
        );

        if (!option.label.trim()) {
          throw new Error(
            `Interaction menu option label is required: ${option.value}`
          );
        }
      }

      if (
        menu.minSelections !==
          undefined &&
        menu.minSelections < 0
      ) {
        throw new Error(
          `Interaction menu minSelections cannot be negative: ${menu.id}`
        );
      }

      if (
        menu.maxSelections !==
          undefined &&
        menu.maxSelections < 1
      ) {
        throw new Error(
          `Interaction menu maxSelections must be at least 1: ${menu.id}`
        );
      }

      if (
        menu.minSelections !==
          undefined &&
        menu.maxSelections !==
          undefined &&
        menu.minSelections >
          menu.maxSelections
      ) {
        throw new Error(
          `Interaction menu minSelections cannot exceed maxSelections: ${menu.id}`
        );
      }
    }
  }
}