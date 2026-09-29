import { createTelegramBot } from "./bot.js";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error(
    "TELEGRAM_BOT_TOKEN environment variable is not set"
  );
}

const bot = createTelegramBot(token);

console.log("Modexa Telegram bot is starting...");

await bot.start();