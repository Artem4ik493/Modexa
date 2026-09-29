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

export interface InteractionResponse {
  content?: string;

  buttons?: InteractionButton[];

  menus?: InteractionMenu[];
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