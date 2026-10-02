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

  "command.settings.description":
    "Show settings",
  "settings.community_unavailable":
    "Community settings are not available yet.",
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