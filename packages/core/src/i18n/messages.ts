import { readFileSync } from "node:fs";

import { resolve } from "node:path";

import { fileURLToPath } from "node:url";

import type { Locale } from "./locale.js";

const MESSAGE_KEYS = [
  "interaction.not_found",
  "interaction.expired",
  "interaction.forbidden",
  "interaction.unhandled",
  "interaction.failed",
  "command.ping.description",
  "command.forbidden",
  "command.dm_only",
  "command.permission_denied",
  "command.disabled",
  "command.execution_failed",
  "command.not_found",
  "command.ping.pong",
  "command.menu.description",
  "menu.title",
  "menu.account",
  "menu.settings",
  "menu.back",
  "menu.close",
  "menu.help",
  "command.account.description",
  "account.dm_only",
  "account.title",
  "account.name",
  "account.username",
  "account.platform",
  "account.platform_id",
  "account.status",
  "account.status.linked",
  "account.status.unlinked",
  "account.linked_account",
  "account.link",
  "account.unlink",
  "account.unlink_forbidden",
  "account.unlink_unavailable",
  "account.unlink_last",
  "account.unlink_success",
  "account.open",
  "account.context",
  "account.link",
  "command.link.description",
  "link.error.dm_only",
  "link.success.created",
  "link.code",
  "link.target",
  "link.command",
  "link.expires",
  "link.success.completed",
  "link.error.linked",
  "link.error.invalid_code",
  "link.error.wrong_platform",
  "link.error.identity_in_use",
  "link.error.identity_unavailable",
  "link.error.same_account",
  "context.dm",
  "context.community",
  "command.bridge_test.description",
  "bridge.test.title",
  "bridge.test.scope.any",
  "bridge.test.scope.account",
  "bridge.test.communities.title",
  "bridge.test.channels.title",
  "bridge.test.no_accounts",
  "bridge.test.no_chats",
  "bridge.test.private_source.telegram",
  "bridge.test.private_source.discord",
  "bridge.test.no_communities.telegram",
  "bridge.test.no_communities.discord",
  "bridge.test.private_target.telegram",
  "bridge.test.private_target.discord",
  "bridge.test.source",
  "bridge.test.page",
  "bridge.test.community_only",
  "bridge.test.forbidden",
  "bridge.test.source_unknown",
  "bridge.test.no_targets",
  "bridge.test.previous",
  "bridge.test.next",
  "bridge.test.back",
  "bridge.test.close",
  "bridge.test.page_unavailable",
  "bridge.test.endpoint_unavailable",
  "bridge.test.request_sent",
  "bridge.test.confirmation",
  "bridge.test.confirm",
  "bridge.test.reject",
  "bridge.test.success",
  "bridge.test.confirmed",
  "bridge.test.rejected",
  "bridge.test.unknown_action",
  "command.settings.description",
  "settings.community_unavailable",
  "settings.forbidden",
  "settings.community",
  "settings.categories.title",
  "settings.category.general",
  "settings.category.bridges",
  "settings.bridges.title",
  "settings.bridges.empty",
  "settings.bridges.unavailable",
  "settings.bridges.not_found",
  "settings.bridge.title",
  "settings.bridge.remove",
  "settings.bridge.remove_confirm",
  "settings.bridge.remove_confirm_button",
  "settings.bridge.removed",
  "settings.mode.public",
  "settings.mode.private",
  "settings.mode.public_button",
  "settings.mode.private_button",
  "settings.dm",
  "command.help.description",
  "command.commands.description",
  "help.title",
  "help.intro",
  "help.topic.start",
  "help.topic.account",
  "help.topic.community",
  "help.topic.moderation",
  "help.topic.bridge",
  "help.topic.settings",
  "help.page.start",
  "help.page.account",
  "help.page.community",
  "help.page.moderation",
  "help.page.bridge",
  "help.page.settings",
  "help.home",
  "help.open_wiki",
  "help.empty",
  "help.no_description",
  "commands.group.moderation",
  "commands.group.members",
  "commands.group.settings",
  "commands.group.account",
  "commands.group.general",
  "message.error",
  "menu.system",
  "command.system.description",
  "system.forbidden",
  "system.title",
  "system.name",
  "system.version",
  "system.platform",
  "system.role",
  "system.persistence",
  "system.settings.button",
  "system.settings.title",
  "system.maintenance.on",
  "system.maintenance.off",
  "system.maintenance.toggle",
  "system.maintenance.active",
  "command.member.description",
  "member.community_only",
  "member.not_found",
  "member.title",
  "member.name",
  "member.id",
  "member.username",
  "member.platform",
  "member.roles",
  "member.no_roles",
  "member.joined",
  "member.platform_roles",
  "member.no_platform_roles",
  "member.platform_joined",
  "member.platform_status",
  "command.members.description",
  "command.role.description",
  "command.role.inactive_member",
  "members.community_only",
  "members.title",
  "members.empty",
  "members.page",
  "members.page_not_found",
  "members.previous",
  "members.next",
  "help.category.information",
  "help.category.members",
  "help.category.moderation",
  "help.category.community",
  "help.category.account",
  "help.category.utilities",
  "help.all_categories",
  "help.category_heading",
  "help.category_missing",
  "help.command_missing",
  "help.select_category",
  "help.open_commands",
  "help.page",
  "help.command_title",
  "help.command_description",
  "help.usage",
  "help.examples",
  "help.example",
  "help.dm_note"
] as const;

export type MessageKey =
  typeof MESSAGE_KEYS[number];

export type MessageCatalog =
  Record<MessageKey, string>;

type RawCatalog = Record<string, unknown>;

const LOCALE_FILES: Record<
  Locale,
  string
> = {
  ru: "ru-RU.yaml",
  en: "en-US.yaml"
};

const DEFAULT_LOCALIZATION_DIRECTORY =
  fileURLToPath(
    new URL(
      "../../../../localization/language",
      import.meta.url
    )
  );

function localizationDirectory(): string {
  return resolve(
    process.env.MODEXA_LOCALIZATION_DIR ??
      DEFAULT_LOCALIZATION_DIRECTORY
  );
}

function parseFlatYaml(
  source: string,
  filePath: string
): RawCatalog {
  const catalog: RawCatalog = {};

  for (const [index, rawLine] of source
    .split(/\r?\n/)
    .entries()) {
    const line = rawLine.trim();

    if (
      !line ||
      line.startsWith("#")
    ) {
      continue;
    }

    const separator =
      line.indexOf(":");

    if (separator <= 0) {
      throw new Error(
        `Invalid localization syntax in ${filePath} at line ${index + 1}`
      );
    }

    const key =
      line.slice(0, separator).trim();

    const rawValue =
      line.slice(separator + 1).trim();

    if (
      !rawValue.startsWith("'") ||
      !rawValue.endsWith("'")
    ) {
      throw new Error(
        `Localization value for "${key}" must be single-quoted in ${filePath} at line ${index + 1}`
      );
    }

    const value =
      rawValue
        .slice(1, -1)
        .replace(/''/g, "'")
        .replace(/\\r/g, "\r")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t");

    catalog[key] = value;
  }

  return catalog;
}

function loadCatalog(
  locale: Locale
): MessageCatalog {
  const filePath = resolve(
    localizationDirectory(),
    LOCALE_FILES[locale]
  );

  let parsed: RawCatalog;

  try {
    parsed = parseFlatYaml(
      readFileSync(filePath, "utf8"),
      filePath
    );
  } catch (error) {
    throw new Error(
      `Failed to load Modexa localization "${locale}" from ${filePath}`,
      { cause: error }
    );
  }

  const catalog =
    {} as MessageCatalog;

  for (const key of MESSAGE_KEYS) {
    const value = parsed[key];

    if (typeof value !== "string") {
      throw new Error(
        `Missing localization key "${key}" in ${filePath}`
      );
    }

    catalog[key] = value;
  }

  return catalog;
}

export const ruMessages =
  loadCatalog("ru");

export const enMessages =
  loadCatalog("en");

export const catalogs: Record<
  Locale,
  MessageCatalog
> = {
  ru: ruMessages,
  en: enMessages
};
