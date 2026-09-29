import { describe, expect, it } from "vitest";
import { CommandParser } from "../src/parser.js";

describe("CommandParser", () => {
  const parser = new CommandParser();

  it("parses a command without arguments", () => {
    expect(parser.parse("/ping")).toEqual({
      name: "ping",
      args: []
    });
  });

  it("parses a command with arguments", () => {
    expect(parser.parse("/ping hello world")).toEqual({
      name: "ping",
      args: ["hello", "world"]
    });
  });

  it("normalizes command name to lowercase", () => {
    expect(parser.parse("/PING test")).toEqual({
      name: "ping",
      args: ["test"]
    });
  });

  it("returns null for regular text", () => {
    expect(parser.parse("hello world")).toBeNull();
  });

  it("returns null for an empty command", () => {
    expect(parser.parse("/")).toBeNull();
  });

  it("ignores surrounding whitespace", () => {
    expect(parser.parse("   /ping hello   ")).toEqual({
      name: "ping",
      args: ["hello"]
    });
  });
});