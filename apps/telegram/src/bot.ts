import { Bot } from "grammy";
import {
  CommandParser,
  CommandRegistry,
  CommandService,
  createBuiltinCommands
} from "@modexa/core";

function getDisplayName(user: {
  first_name: string;
  last_name?: string;
  username?: string;
}): string {
  const fullName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  if (user.username) {
    return user.username;
  }

  return "Telegram User";
}

export function createTelegramBot(token: string): Bot {
  const bot = new Bot(token);

  const parser = new CommandParser();
  const registry = new CommandRegistry();

  createBuiltinCommands(registry);

  const commandService = new CommandService(
    parser,
    registry
  );

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;

    const result = await commandService.handle(text, {
      platform: "telegram",
      user: {
        id: `telegram:${ctx.from.id}`,
        displayName: getDisplayName(ctx.from),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      community:
        ctx.chat.type === "group" || ctx.chat.type === "supergroup"
          ? {
              id: `telegram:${ctx.chat.id}`,
              name: ctx.chat.title,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          : undefined
    });

    if (!result.handled || !result.response) {
      return;
    }

    await ctx.reply(result.response.content);
  });

  return bot;
}