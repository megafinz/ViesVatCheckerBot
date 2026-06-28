import type { AdminNotification, AdminNotifier } from '@viesvatchecker/core';
import type { TelegramMessenger } from './telegram-api';

type Fetch = (request: Request) => Promise<Response>;

export type FormattedAdminNotification = {
  title: string;
  message: string;
  priority: 'high';
  tags: string[];
};

export interface AdminNotificationLogger {
  error(...args: unknown[]): void;
}

export function formatAdminNotification(
  notification: AdminNotification
): FormattedAdminNotification {
  switch (notification.type) {
    case 'pending-vat-unrecoverable-error':
      return {
        title: 'VIES VAT checker error',
        message: `There was an error while processing VAT number '${notification.vatNumber}': ${notification.errorMessage}`,
        priority: 'high',
        tags: ['rotating_light']
      };
  }
}

export function createLoggerAdminNotifier(options: {
  logger?: AdminNotificationLogger;
}): AdminNotifier {
  const logger = options.logger ?? console;

  return {
    async notify(notification) {
      const formatted = formatAdminNotification(notification);
      logger.error('[admin-notification]', formatted.title, formatted.message);
    }
  };
}

export function createTelegramAdminNotifier(options: {
  chatIds: string[];
  telegram: TelegramMessenger;
}): AdminNotifier {
  return {
    async notify(notification) {
      const formatted = formatAdminNotification(notification);
      const text = `🔴 [ADMIN] ${formatted.message}`;

      for (const chatId of options.chatIds) {
        await options.telegram.sendMessage(chatId, text);
      }
    }
  };
}

export function createNtfyAdminNotifier(options: {
  fetch?: Fetch;
  token?: string;
  topic: string;
  url: string;
}): AdminNotifier {
  const fetchImpl = options.fetch ?? fetch;

  return {
    async notify(notification) {
      const formatted = formatAdminNotification(notification);
      const url = new URL(options.topic, ensureTrailingSlash(options.url));
      const headers = new Headers({
        priority: formatted.priority,
        tags: formatted.tags.join(','),
        title: formatted.title
      });

      if (options.token) {
        headers.set('authorization', `Bearer ${options.token}`);
      }

      const response = await fetchImpl(
        new Request(url, {
          body: formatted.message,
          headers,
          method: 'POST'
        })
      );

      if (!response.ok) {
        throw new Error(`ntfy notification failed: ${response.status}`);
      }
    }
  };
}

export function createFanOutAdminNotifier(options: {
  logger?: AdminNotificationLogger;
  notifiers: Array<{ name: string; notifier: AdminNotifier }>;
}): AdminNotifier {
  const logger = options.logger ?? console;

  return {
    async notify(notification) {
      for (const item of options.notifiers) {
        try {
          await item.notifier.notify(notification);
        } catch (error) {
          logger.error(
            '[admin-notification]',
            `${item.name} failed`,
            error instanceof Error ? error.message : error
          );
        }
      }
    }
  };
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}
