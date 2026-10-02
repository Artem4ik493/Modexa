import {
  describe,
  expect,
  it
} from "vitest";

import {
  BridgeService,
  CommandRegistry,
  CommunityService,
  IdentityLinkService,
  IdentityLinkingService,
  IdentityService,
  MembershipService,
  createBridgeTestCommand,
  createBuiltinCommands,
  createIdentityLinkCommand,
  listCommandDescriptors,
  type CommandDescriptor
} from "@modexa/core";

import {
  buildDiscordSlashCommands
} from "./slash-commands.js";

function builtinDescriptors() {
  const registry =
    new CommandRegistry();

  createBuiltinCommands(registry);

  return listCommandDescriptors(registry);
}


function fullDescriptors() {
  const registry =
    new CommandRegistry();

  const communityService =
    new CommunityService();

  const identityService =
    new IdentityService();

  const identityLinkService =
    new IdentityLinkService();

  const identityLinkingService =
    new IdentityLinkingService(
      identityService,
      identityLinkService
    );

  const membershipService =
    new MembershipService();

  const bridgeService =
    new BridgeService(
      communityService
    );

  createBuiltinCommands(
    registry,
    communityService
  );

  registry.register(
    createIdentityLinkCommand(
      identityService,
      identityLinkService,
      identityLinkingService
    )
  );

  registry.register(
    createBridgeTestCommand(
      bridgeService,
      identityService,
      membershipService
    )
  );

  return listCommandDescriptors(registry);
}

describe("buildDiscordSlashCommands", () => {
  it("registers the full current Modexa command set including /link", () => {
    const names =
      buildDiscordSlashCommands(
        fullDescriptors()
      ).map((command) => command.name);

    expect(names.sort()).toEqual([
      "account",
      "bridgetest",
      "commands",
      "help",
      "link",
      "link-account",
      "linkaccount",
      "menu",
      "ping",
      "settings"
    ]);
  });

  it("registers every command and alias", () => {
    const names =
      buildDiscordSlashCommands(
        builtinDescriptors()
      ).map((command) => command.name);

    expect(names.sort()).toEqual([
      "account",
      "commands",
      "help",
      "menu",
      "ping",
      "settings"
    ]);
  });

  it("uses Russian as the default description and English as a localization", () => {
    const ping =
      buildDiscordSlashCommands(
        builtinDescriptors()
      ).find(
        (command) =>
          command.name === "ping"
      );

    expect(ping).toEqual({
      name: "ping",
      description:
        "Проверить, что Modexa работает",
      descriptionLocalizations: {
        "en-US": "Check if Modexa is alive"
      }
    });
  });

  it("gives an alias the description of its command", () => {
    const commands =
      buildDiscordSlashCommands(
        builtinDescriptors()
      );

    const help = commands.find(
      (command) => command.name === "help"
    );

    const alias = commands.find(
      (command) =>
        command.name === "commands"
    );

    expect(alias?.description).toBe(
      help?.description
    );
  });

  it("truncates descriptions to 100 characters", () => {
    const [command] =
      buildDiscordSlashCommands([
        {
          name: "long",
          aliases: [],
          descriptions: {
            ru: "я".repeat(150),
            en: "e".repeat(150)
          }
        }
      ]);

    expect(command.description).toHaveLength(
      100
    );

    expect(
      command.descriptionLocalizations?.[
        "en-US"
      ]
    ).toHaveLength(100);
  });

  it("skips duplicate names", () => {
    const descriptor: CommandDescriptor = {
      name: "same",
      aliases: ["same"],
      descriptions: {
        ru: "Описание",
        en: "Description"
      }
    };

    expect(
      buildDiscordSlashCommands([
        descriptor
      ])
    ).toHaveLength(1);
  });

  it("rejects invalid command names", () => {
    expect(() =>
      buildDiscordSlashCommands([
        {
          name: "bad name",
          aliases: [],
          descriptions: {
            ru: "Описание",
            en: "Description"
          }
        }
      ])
    ).toThrow(
      "Invalid Discord slash command name: bad name"
    );
  });
});