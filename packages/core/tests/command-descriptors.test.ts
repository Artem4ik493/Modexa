import {
  describe,
  expect,
  it
} from "vitest";

import {
  CommandRegistry,
  createBuiltinCommands,
  listCommandDescriptors
} from "../src/index.js";

describe("listCommandDescriptors", () => {
  it("describes built-in commands in every locale", () => {
    const registry =
      new CommandRegistry();

    createBuiltinCommands(registry);

    const descriptors =
      listCommandDescriptors(registry);

    const help = descriptors.find(
      (descriptor) =>
        descriptor.name === "help"
    );

    expect(help?.aliases).toEqual([]);

    expect(help?.descriptions).toEqual({
      ru: "Открыть базу знаний Modexa",
      en: "Open the Modexa knowledge base"
    });

    expect(
      descriptors.map(
        (descriptor) => descriptor.name
      )
    ).toEqual([
      "ping",
      "menu",
      "account",
      "system",
      "settings",
      "help",
      "commands"
    ]);
  });

  it("uses the plain description when there is no key", () => {
    const registry =
      new CommandRegistry();

    registry.register({
      name: "echo",
      description: "Repeat text",
      handler: () => ({ content: "" })
    });

    const [echo] =
      listCommandDescriptors(registry);

    expect(echo.descriptions).toEqual({
      ru: "Repeat text",
      en: "Repeat text"
    });
  });

  it("falls back to a translated placeholder", () => {
    const registry =
      new CommandRegistry();

    registry.register({
      name: "bare",
      handler: () => ({ content: "" })
    });

    const [bare] =
      listCommandDescriptors(registry);

    expect(bare.descriptions).toEqual({
      ru: "Без описания",
      en: "No description"
    });
  });

  it("lowercases names and aliases", () => {
    const registry =
      new CommandRegistry();

    registry.register({
      name: "Ping",
      aliases: ["P"],
      handler: () => ({ content: "" })
    });

    const [ping] =
      listCommandDescriptors(registry);

    expect(ping.name).toBe("ping");
    expect(ping.aliases).toEqual(["p"]);
  });
});