import type { Locale } from "./locale.js";

export const ruMessages = {
  "interaction.not_found":
    "Это действие больше недоступно.",
  "interaction.expired":
    "Срок действия истёк. Вызовите команду снова.",
  "interaction.forbidden":
    "Это действие принадлежит другому пользователю.",
  "interaction.unhandled":
    "Это действие не поддерживается.",
  "interaction.failed":
    "Что-то пошло не так. Попробуйте ещё раз.",

  "command.ping.description":
    "Проверить, что Modexa работает",
  "command.forbidden":
   "У вас недостаточно прав для использования команд в этом сообществе.",
  "command.not_found":
    "Команда не найдена. Для просмотра доступных команд для вашей роли {role} используйте /help.",
  "command.ping.pong":
    "Понг!",

  "command.menu.description":
    "Показать главное меню",
  "menu.title":
    "Выберите действие:",
  "menu.account":
    "Аккаунт",
  "menu.settings":
    "Настройки",
  "menu.back":
    "Назад",

  "command.account.description":
    "Показать ваш аккаунт Modexa",
  "account.dm_only":
    "Управление аккаунтом доступно только в личном чате с ботом.",
  "account.title":
    "Аккаунт",
  "account.name":
    "Имя: {name}",
  "account.id":
    "ID: {id}",
  "account.context":
    "Контекст: {context}",

  "context.dm":
    "личный чат",
  "context.community":
    "сообщество",

  "command.bridge_test.description":
    "Тестово связать чат Telegram и Discord",
  "bridge.test.title":
    "Выберите чат для связи",
  "bridge.test.source":
    "Источник: {platform} — {community} / {channel}",
  "bridge.test.page":
    "Страница: {page}/{total}",
  "bridge.test.community_only":
    "Эту команду можно использовать только в чате сообщества.",
  "bridge.test.forbidden":
    "Для создания Bridge-связки нужны права управления сообществом.",
  "bridge.test.source_unknown":
    "Текущий чат ещё не зарегистрирован в Modexa. Отправьте сообщение боту и повторите команду.",
  "bridge.test.no_targets":
    "Нет доступных чатов другой платформы для связи.",
  "bridge.test.previous":
    "← Назад",
  "bridge.test.next":
    "Далее →",
  "bridge.test.page_unavailable":
    "Страница больше недоступна.",
  "bridge.test.endpoint_unavailable":
    "Чат для привязки больше недоступен.",
  "bridge.test.request_sent":
    "Запрос отправлен в {target}. Ожидаем подтверждение.",
  "bridge.test.confirmation":
    "Запрос на привязку\n\nИсточник: {source}\n\nПодтвердите создание связи с этим чатом.",
  "bridge.test.confirm":
    "Подтвердить",
  "bridge.test.reject":
    "Отклонить",
  "bridge.test.success":
    "Bridge подключён!\n\n{source}\n{target}\n\nСвязка работает.",
  "bridge.test.confirmed":
    "Связка подтверждена. Bridge работает.",
  "bridge.test.rejected":
    "Запрос на привязку отклонён.",
  "bridge.test.unknown_action":
    "Неизвестное действие Bridge.",

  "command.settings.description":
    "Показать настройки",
  "settings.community_unavailable":
    "Настройки сообщества пока недоступны.",
  "settings.forbidden":
    "Для изменения настроек нужны права управления сообществом.",
  "settings.community":
    "Настройки сообщества",
  "settings.mode.public":
    "Режим: публичный",
  "settings.mode.private":
    "Режим: приватный",
  "settings.mode.public_button":
    "🌐 Публичный",
  "settings.mode.private_button":
    "🔒 Приватный",
  "settings.dm":
    "Настройки\nПока нечего настраивать.",

  "command.help.description":
    "Показать список команд",
  "help.title":
    "Доступные команды:",
  "help.empty":
    "Нет доступных команд.",
  "help.no_description":
    "Без описания"
    
} as const;

export type MessageKey =
  keyof typeof ruMessages;

export type MessageCatalog =
  Record<MessageKey, string>;

export const enMessages: MessageCatalog = {
  "interaction.not_found":
    "This action is no longer available.",
  "interaction.expired":
    "This action has expired. Please run the command again.",
  "interaction.forbidden":
    "This action belongs to another user.",
  "interaction.unhandled":
    "This action is not supported.",
  "interaction.failed":
    "Something went wrong. Please try again.",

  "command.ping.description":
    "Check if Modexa is alive",
  "command.forbidden":
    "You do not have permission to use commands in this community.",
  "command.not_found":
    "Command not found. To view commands available for your role {role}, use /help.",
  "command.ping.pong":
    "Pong!",

  "command.menu.description":
    "Show the main menu",
  "menu.title":
    "Choose an action:",
  "menu.account":
    "Account",
  "menu.settings":
    "Settings",
  "menu.back":
    "Back",

  "command.account.description":
    "Show your Modexa account",
  "account.dm_only":
    "Account management is only available in a private chat with the bot.",
  "account.title":
    "Account",
  "account.name":
    "Name: {name}",
  "account.id":
    "ID: {id}",
  "account.context":
    "Context: {context}",

  "context.dm":
    "private chat",
  "context.community":
    "community",

  "command.bridge_test.description":
    "Test-link a Telegram and Discord chat",
  "bridge.test.title":
    "Choose a chat to link",
  "bridge.test.source":
    "Source: {platform} — {community} / {channel}",
  "bridge.test.page":
    "Page: {page}/{total}",
  "bridge.test.community_only":
    "This command can only be used in a community chat.",
  "bridge.test.forbidden":
    "Community management permission is required to create a Bridge link.",
  "bridge.test.source_unknown":
    "This chat has not been registered in Modexa yet. Send a message to the bot and try again.",
  "bridge.test.no_targets":
    "There are no available chats on the other platform to link.",
  "bridge.test.previous":
    "← Back",
  "bridge.test.next":
    "Next →",
  "bridge.test.page_unavailable":
    "This page is no longer available.",
  "bridge.test.endpoint_unavailable":
    "The selected chat is no longer available.",
  "bridge.test.request_sent":
    "Request sent to {target}. Waiting for confirmation.",
  "bridge.test.confirmation":
    "Link request\n\nSource: {source}\n\nConfirm creating a bridge with this chat.",
  "bridge.test.confirm":
    "Confirm",
  "bridge.test.reject":
    "Reject",
  "bridge.test.success":
    "Bridge connected!\n\n{source}\n{target}\n\nThe link is working.",
  "bridge.test.confirmed":
    "Link confirmed. Bridge is working.",
  "bridge.test.rejected":
    "Link request rejected.",
  "bridge.test.unknown_action":
    "Unknown Bridge action.",

  "command.settings.description":
    "Show settings",
  "settings.community_unavailable":
    "Community settings are not available yet.",
  "settings.forbidden":
    "Community management permission is required to change settings.",
  "settings.community":
    "Community settings",
  "settings.mode.public":
    "Mode: public",
  "settings.mode.private":
    "Mode: private",
  "settings.mode.public_button":
    "🌐 Public",
  "settings.mode.private_button":
    "🔒 Private",
  "settings.dm":
    "Settings\nNothing to configure yet.",

  "command.help.description":
    "Show available commands",
  "help.title":
    "Available commands:",
  "help.empty":
    "No commands available.",
  "help.no_description":
    "No description"
};

export const catalogs: Record<
  Locale,
  MessageCatalog
> = {
  ru: ruMessages,
  en: enMessages
};