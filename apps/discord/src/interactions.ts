import type {
  BoundInteractionResponse
} from "@modexa/core";

export const DISCORD_CUSTOM_ID_PREFIX =
  "mx:";

export const DISCORD_CUSTOM_ID_MAX_LENGTH =
  100;

const BUTTONS_PER_ROW = 5;
const MAX_ROWS = 5;
const MAX_LABEL_LENGTH = 80;

const BUTTON_TYPE = 2;
const ACTION_ROW_TYPE = 1;
const STYLE_SECONDARY = 2;
const STYLE_LINK = 5;

export interface DiscordButton {
  type: 2;
  style: 2 | 5;
  label: string;
  custom_id?: string;
  url?: string;
}

export interface DiscordActionRow {
  type: 1;
  components: DiscordButton[];
}

export function createDiscordCustomId(
  token: string
): string {
  const id =
    `${DISCORD_CUSTOM_ID_PREFIX}${token}`;

  if (
    id.length >
    DISCORD_CUSTOM_ID_MAX_LENGTH
  ) {
    throw new Error(
      "Discord custom_id exceeds 100-character limit"
    );
  }

  return id;
}

export function parseDiscordCustomId(
  customId: string | undefined
): string | undefined {
  if (
    !customId ||
    !customId.startsWith(
      DISCORD_CUSTOM_ID_PREFIX
    )
  ) {
    return undefined;
  }

  const token = customId.slice(
    DISCORD_CUSTOM_ID_PREFIX.length
  );

  return token.length > 0
    ? token
    : undefined;
}

function truncateLabel(
  label: string
): string {
  return label.length > MAX_LABEL_LENGTH
    ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…`
    : label;
}

export function renderDiscordInteraction(
  response: BoundInteractionResponse
): DiscordActionRow[] | undefined {
  const buttons: DiscordButton[] = [];

  for (const button of response.buttons ?? []) {
    if (button.disabled) {
      continue;
    }

    if (button.action.type === "link") {
      buttons.push({
        type: BUTTON_TYPE,
        style: STYLE_LINK,
        label: truncateLabel(button.label),
        url: button.action.url
      });

      continue;
    }

    if (!button.token) {
      throw new Error(
        `Interaction button has no token: ${button.id}`
      );
    }

    buttons.push({
      type: BUTTON_TYPE,
      style: STYLE_SECONDARY,
      label: truncateLabel(button.label),
      custom_id: createDiscordCustomId(
        button.token
      )
    });
  }

  for (const menu of response.menus ?? []) {
    for (const option of menu.options) {
      buttons.push({
        type: BUTTON_TYPE,
        style: STYLE_SECONDARY,
        label: truncateLabel(option.label),
        custom_id: createDiscordCustomId(
          option.token
        )
      });
    }
  }

  if (buttons.length === 0) {
    return undefined;
  }

  if (
    buttons.length >
    BUTTONS_PER_ROW * MAX_ROWS
  ) {
    throw new Error(
      "Discord message cannot contain more than 25 buttons"
    );
  }

  const rows: DiscordActionRow[] = [];

  for (
    let index = 0;
    index < buttons.length;
    index += BUTTONS_PER_ROW
  ) {
    rows.push({
      type: ACTION_ROW_TYPE,
      components: buttons.slice(
        index,
        index + BUTTONS_PER_ROW
      )
    });
  }

  return rows;
}