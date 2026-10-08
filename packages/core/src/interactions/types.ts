export type InteractionId =
  string;

export type InteractionActionType =
  | "command"
  | "link"
  | "callback";

export interface InteractionButton {
  id: string;

  label: string;

  action:
    | {
        type: "command";
        command: string;
        args?: string[];
      }
    | {
        type: "link";
        url: string;
      }
    | {
        type: "callback";
        data: string;
      };

  disabled?: boolean;
}

export interface InteractionMenuOption {
  value: string;

  label: string;

  description?: string;
}

export interface InteractionMenu {
  id: string;

  placeholder?: string;

  options: InteractionMenuOption[];

  minSelections?: number;

  maxSelections?: number;
}

export interface InteractionEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface InteractionEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: InteractionEmbedField[];
  footer?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
}

export interface InteractionMedia {
  type: "image" | "animation" | "video";
  url: string;
}

export interface InteractionResponse {
  content?: string;
  media?: InteractionMedia;
  embed?: InteractionEmbed;

  format?: "plain" | "markdown";

  imageUrl?: string;

  buttons?: InteractionButton[];

  menus?: InteractionMenu[];

  /** Remove the current interactive message when handled. */
  close?: boolean;
}

export interface InteractionRequest {
  id: InteractionId;

  actionType: InteractionActionType;

  actionId: string;

  userId: string;

  platform: string;

  data?: Record<
    string,
    unknown
  >;
}

/**
 * Action that Core can execute after a user
 * interacts with a rendered button or menu option.
 * Link buttons are handled by the platform itself.
 */
export type StoredInteractionAction =
  | {
      type: "command";
      command: string;
      args?: string[];
    }
  | {
      type: "callback";
      data: string;
    }
  | {
      type: "menu";
      menuId: string;
      value: string;
    };

/**
 * Button with a compact token that adapters
 * put into platform callback payloads.
 * Link and disabled buttons have no token.
 */
export interface BoundInteractionButton
  extends InteractionButton {
  token?: string;
}

export interface BoundInteractionMenuOption
  extends InteractionMenuOption {
  token: string;
}

export interface BoundInteractionMenu
  extends Omit<
    InteractionMenu,
    "options"
  > {
  options: BoundInteractionMenuOption[];
}

export interface BoundInteractionResponse {
  content?: string;
  media?: InteractionMedia;
  embed?: InteractionEmbed;

  format?: "plain" | "markdown";

  imageUrl?: string;

  buttons?: BoundInteractionButton[];

  menus?: BoundInteractionMenu[];

  close?: boolean;
}