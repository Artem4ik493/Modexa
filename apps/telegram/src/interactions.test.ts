import {
  describe,
  expect,
  it
} from "vitest";

import {
  renderTelegramInteraction
} from "./interactions.js";

describe(
  "Telegram interactions",
  () => {
    it(
      "returns undefined for a text-only response",
      () => {
        const result =
          renderTelegramInteraction({
            content: "Hello"
          });

        expect(
          result
        ).toBeUndefined();
      }
    );

    it(
      "renders command buttons",
      () => {
        const result =
          renderTelegramInteraction({
            content:
              "Choose an action",
            buttons: [
              {
                id:
                  "account",
                label:
                  "Account",
                action: {
                  type:
                    "command",
                  command:
                    "/account"
                }
              }
            ]
          });

        expect(
          result
        ).toBeDefined();

        expect(
          result?.inline_keyboard
        ).toHaveLength(1);

        expect(
          result?.inline_keyboard[0]
        ).toHaveLength(1);

        const button =
          result?.inline_keyboard[0][0];

        expect(
          button
        ).toHaveProperty(
          "callback_data",
          "command:account"
        );
      }
    );

    it(
      "renders callback buttons",
      () => {
        const result =
          renderTelegramInteraction({
            buttons: [
              {
                id:
                  "settings",
                label:
                  "Settings",
                action: {
                  type:
                    "callback",
                  data:
                    "settings:open"
                }
              }
            ]
          });

        const button =
          result?.inline_keyboard[0][0];

        expect(
          button
        ).toHaveProperty(
          "callback_data",
          "callback:settings:open"
        );
      }
    );

    it(
      "renders link buttons",
      () => {
        const result =
          renderTelegramInteraction({
            buttons: [
              {
                id:
                  "website",
                label:
                  "Website",
                action: {
                  type:
                    "link",
                  url:
                    "https://example.com"
                }
              }
            ]
          });

        const button =
          result?.inline_keyboard[0][0];

        expect(
          button
        ).toHaveProperty(
          "url",
          "https://example.com"
        );
      }
    );

    it(
      "renders menu options",
      () => {
        const result =
          renderTelegramInteraction({
            menus: [
              {
                id:
                  "plan",
                options: [
                  {
                    value:
                      "free",
                    label:
                      "Free"
                  },
                  {
                    value:
                      "pro",
                    label:
                      "Pro"
                  }
                ]
              }
            ]
          });

        expect(
          result?.inline_keyboard
        ).toHaveLength(2);

        const firstButton =
          result?.inline_keyboard[0][0];

        const secondButton =
          result?.inline_keyboard[1][0];

        expect(
          firstButton
        ).toHaveProperty(
          "callback_data",
          "menu:plan:free"
        );

        expect(
          secondButton
        ).toHaveProperty(
          "callback_data",
          "menu:plan:pro"
        );
      }
    );

    it(
      "does not render disabled buttons",
      () => {
        const result =
          renderTelegramInteraction({
            buttons: [
              {
                id:
                  "disabled",
                label:
                  "Disabled",
                disabled:
                  true,
                action: {
                  type:
                    "callback",
                  data:
                    "disabled"
                }
              }
            ]
          });

        expect(
          result
        ).toBeUndefined();
      }
    );
  }
);