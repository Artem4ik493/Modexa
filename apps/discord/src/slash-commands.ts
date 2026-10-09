import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type CommandDescriptor,
  type Locale
} from "@modexa/core";

const DISCORD_LOCALE_CODES: Record<Locale, string> = {
  ru: "ru",
  en: "en-US"
};

const NAME_PATTERN = /^[-_\\p{L}\\p{N}]{1,32}$/u;
const MAX_DESCRIPTION_LENGTH = 100;
const MAX_COMMANDS = 100;

type SlashOptionType = 3 | 4 | 6;

export interface DiscordSlashOption {
  name: string;
  description: string;
  type: SlashOptionType;
  required?: boolean;
  nameLocalizations?: Record<string, string>;
  descriptionLocalizations?: Record<string, string>;
}

const OPTION_DESCRIPTION_EN: Record<string, string> = {
  user: "Member to target",
  duration: "Mute duration, for example 10m or 2h",
  reason: "Reason for this action",
  role: "Role to assign",
  command: "Command name",
  state: "on or off",
  count: "Number of messages (1–100)",
  case: "Moderation case ID",
  page: "Page number"
};

const OPTION_DESCRIPTION_RU: Record<string, string> = {
  user: "Участник",
  duration: "Длительность мута, например 10m или 2h",
  reason: "Причина действия",
  role: "Роль для назначения",
  command: "Название команды",
  state: "on или off",
  count: "Количество сообщений (1–100)",
  case: "ID модерационного кейса",
  page: "Номер страницы"
};

function option(name: string, type: SlashOptionType, required = false): DiscordSlashOption {
  return {
    name,
    description: OPTION_DESCRIPTION_RU[name] ?? name,
    type,
    required,
    nameLocalizations: { "en-US": name, ru: name },
    descriptionLocalizations: {
      "en-US": OPTION_DESCRIPTION_EN[name] ?? name,
      ru: OPTION_DESCRIPTION_RU[name] ?? name
    }
  };
}

function getOptions(name: string): DiscordSlashOption[] | undefined {
  const user = (required = true) => option("user", 6, required);
  const reason = option("reason", 3, false);
  const duration = option("duration", 3, true);

  switch (name) {
    case "member":
    case "user":
    case "profile":
    case "warnings":
    case "warns":
      return [user(false)];
    case "role":
      return [user(true), option("role", 3, false)];
    case "unmute":
    case "unban":
      return [user(true)];
    case "warn":
    case "kick":
    case "ban":
      return [user(true), reason];
    case "mute":
      return [user(true), duration, reason];
    case "mutes":
    case "mute-list":
    case "modhistory":
    case "resetwarns":
      return [user(true)];
    case "remwarn":
    case "remwarning":
    case "case":
    case "modcase":
      return [option("case", 3, true)];
    case "command":
      return [option("command", 3, true), option("state", 3, true)];
    case "clear":
      return [option("count", 4, true)];
    case "members":
      return [option("page", 4, false)];
    default:
      return undefined;
  }
}

export interface DiscordSlashCommand {
  name: string;
  description: string;
  descriptionLocalizations?: Record<string, string>;
  options?: DiscordSlashOption[];
}

function truncate(text: string): string {
  return text.length > MAX_DESCRIPTION_LENGTH
    ? `${text.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`
    : text;
}

export function buildDiscordSlashCommands(
  descriptors: CommandDescriptor[]
): DiscordSlashCommand[] {
  const commands: DiscordSlashCommand[] = [];
  const seen = new Set<string>();

  for (const descriptor of descriptors) {
    for (const name of [descriptor.name, ...descriptor.aliases]) {
      if (seen.has(name)) continue;

      if (!NAME_PATTERN.test(name)) {
        throw new Error(`Invalid Discord slash command name: ${name}`);
      }

      seen.add(name);
      const localizations: Record<string, string> = {};

      for (const locale of SUPPORTED_LOCALES) {
        if (locale === DEFAULT_LOCALE) continue;
        localizations[DISCORD_LOCALE_CODES[locale]] = truncate(descriptor.descriptions[locale]);
      }

      const options = getOptions(name);
      commands.push({
        name,
        description: truncate(descriptor.descriptions[DEFAULT_LOCALE]),
        descriptionLocalizations: localizations,
        ...(options ? { options } : {})
      });
    }
  }

  if (commands.length > MAX_COMMANDS) {
    throw new Error(`Discord allows at most ${MAX_COMMANDS} slash commands`);
  }

  return commands;
}
