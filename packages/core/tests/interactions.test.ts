import {
  describe,
  expect,
  it
} from "vitest";

import {
  InteractionService
} from "../src/index.js";

describe(
  "InteractionService",
  () => {
    it(
      "creates a text response",
      () => {
        const service =
          new InteractionService();

        const response =
          service.createResponse(
            "Hello"
          );

        expect(
          response
        ).toEqual({
          content: "Hello"
        });
      }
    );

    it(
      "adds buttons to a response",
      () => {
        const service =
          new InteractionService();

        const response =
          service.withButtons(
            service.createResponse(
              "Choose an action"
            ),
            [
              {
                id: "settings",
                label: "Settings",
                action: {
                  type:
                    "command",
                  command:
                    "/settings"
                }
              },
              {
                id: "website",
                label: "Website",
                action: {
                  type:
                    "link",
                  url:
                    "https://example.com"
                }
              }
            ]
          );

        expect(
          response.buttons
        ).toHaveLength(2);

        expect(
          response.buttons?.[0]
        ).toEqual({
          id: "settings",
          label: "Settings",
          action: {
            type: "command",
            command:
              "/settings"
          }
        });
      }
    );

    it(
      "adds menus to a response",
      () => {
        const service =
          new InteractionService();

        const response =
          service.withMenus(
            service.createResponse(
              "Choose a plan"
            ),
            [
              {
                id: "plan",
                placeholder:
                  "Select a plan",
                options: [
                  {
                    value: "free",
                    label: "Free"
                  },
                  {
                    value: "pro",
                    label: "Pro"
                  }
                ]
              }
            ]
          );

        expect(
          response.menus
        ).toHaveLength(1);

        expect(
          response.menus?.[0].options
        ).toHaveLength(2);
      }
    );

    it(
      "accepts a valid response",
      () => {
        const service =
          new InteractionService();

        expect(() =>
          service.validateResponse({
            content: "Hello"
          })
        ).not.toThrow();
      }
    );

    it(
      "rejects an empty response",
      () => {
        const service =
          new InteractionService();

        expect(() =>
          service.validateResponse({})
        ).toThrow(
          "Interaction response must contain content, buttons, or menus"
        );
      }
    );

    it(
      "rejects duplicate button ids",
      () => {
        const service =
          new InteractionService();

        expect(() =>
          service.validateResponse({
            buttons: [
              {
                id: "same",
                label: "One",
                action: {
                  type:
                    "command",
                  command:
                    "/one"
                }
              },
              {
                id: "same",
                label: "Two",
                action: {
                  type:
                    "command",
                  command:
                    "/two"
                }
              }
            ]
          })
        ).toThrow(
          "Duplicate interaction button id: same"
        );
      }
    );

    it(
      "rejects an invalid menu",
      () => {
        const service =
          new InteractionService();

        expect(() =>
          service.validateResponse({
            menus: [
              {
                id: "plan",
                options: []
              }
            ]
          })
        ).toThrow(
          "Interaction menu must contain options: plan"
        );
      }
    );

    it(
      "rejects invalid selection limits",
      () => {
        const service =
          new InteractionService();

        expect(() =>
          service.validateResponse({
            menus: [
              {
                id: "roles",
                options: [
                  {
                    value: "admin",
                    label: "Admin"
                  }
                ],
                minSelections: 2,
                maxSelections: 1
              }
            ]
          })
        ).toThrow(
          "Interaction menu minSelections cannot exceed maxSelections: roles"
        );
      }
    );

    it(
      "validates interaction requests",
      () => {
        const service =
          new InteractionService();

        expect(() =>
          service.validateRequest({
            id: "interaction-1",
            actionType:
              "callback",
            actionId:
              "settings",
            userId:
              "user-1",
            platform:
              "telegram",
            data: {
              section:
                "account"
            }
          })
        ).not.toThrow();
      }
    );

    it(
      "rejects incomplete interaction requests",
      () => {
        const service =
          new InteractionService();

        expect(() =>
          service.validateRequest({
            id: "",
            actionType:
              "callback",
            actionId:
              "settings",
            userId:
              "user-1",
            platform:
              "telegram"
          })
        ).toThrow(
          "Interaction request id is required"
        );
      }
    );
  }
);
