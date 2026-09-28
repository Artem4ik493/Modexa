import {
  CommandParser,
  CommandRegistry,
  CommandService
} from "./index.js";

const parser = new CommandParser();
const registry = new CommandRegistry();

registry.register({
  name: "ping",
  aliases: ["p"],
  description: "Check if Modexa is alive",
  handler: (context) => {
    return {
      content: `Pong! Arguments: ${context.args.join(", ") || "none"}`
    };
  }
});

const service = new CommandService(
  parser,
  registry
);

const context = {
  platform: "telegram" as const,
  user: {
    id: "user-1",
    platform: "telegram" as const,
    displayName: "Test User"
  }
};

const inputs = [
  "/ping",
  "/ping hello",
  "/ping hello world",
  "/PING test",
  "/p alias-test",
  "hello world"
];

for (const input of inputs) {
  console.log(`Input: ${input}`);

  const result = await service.handle(
    input,
    context
  );

  console.log("Result:", result);
  console.log("---");
}