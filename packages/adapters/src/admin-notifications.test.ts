import { describe, expect, test } from 'bun:test';
import type { AdminNotification } from '@viesvatchecker/core';
import {
  createFanOutAdminNotifier,
  createLoggerAdminNotifier,
  createNtfyAdminNotifier,
  createTelegramAdminNotifier,
  formatAdminNotification
} from './admin-notifications';

const notification: AdminNotification = {
  type: 'pending-vat-unrecoverable-error',
  severity: 'error',
  vatNumber: 'PL1234567890',
  errorMessage: 'unexpected parser failure',
  request: {
    telegramChatId: '123',
    countryCode: 'PL',
    vatNumber: '1234567890',
    expirationDate: new Date('2026-07-01T00:00:00.000Z')
  }
};

describe('formatAdminNotification', () => {
  test('formats unrecoverable pending VAT errors', () => {
    expect(formatAdminNotification(notification)).toEqual({
      title: 'VIES VAT checker error',
      message:
        "There was an error while processing VAT number 'PL1234567890': unexpected parser failure",
      priority: 'high',
      tags: ['rotating_light']
    });
  });
});

test('logger admin notifier writes the formatted notification', async () => {
  const logs: unknown[][] = [];
  const notifier = createLoggerAdminNotifier({
    logger: {
      error: (...args: unknown[]) => logs.push(args)
    }
  });

  await notifier.notify(notification);

  expect(logs).toEqual([
    [
      '[admin-notification]',
      'VIES VAT checker error',
      "There was an error while processing VAT number 'PL1234567890': unexpected parser failure"
    ]
  ]);
});

test('telegram admin notifier sends a formatted message to every chat id', async () => {
  const sent: Array<{ chatId: string; text: string }> = [];
  const notifier = createTelegramAdminNotifier({
    chatIds: ['admin-1', 'admin-2'],
    telegram: {
      sendMessage: async (chatId, text) => {
        sent.push({ chatId, text });
      }
    }
  });

  await notifier.notify(notification);

  expect(sent).toEqual([
    {
      chatId: 'admin-1',
      text: "🔴 [ADMIN] There was an error while processing VAT number 'PL1234567890': unexpected parser failure"
    },
    {
      chatId: 'admin-2',
      text: "🔴 [ADMIN] There was an error while processing VAT number 'PL1234567890': unexpected parser failure"
    }
  ]);
});

test('ntfy admin notifier posts the formatted notification', async () => {
  const requests: Request[] = [];
  const notifier = createNtfyAdminNotifier({
    url: 'https://ntfy.example.com',
    topic: 'vies-alerts',
    token: 'secret-token',
    fetch: async (request) => {
      requests.push(request);
      return new Response('', { status: 200 });
    }
  });

  await notifier.notify(notification);

  expect(requests).toHaveLength(1);
  const request = requests[0];
  expect(request.url).toBe('https://ntfy.example.com/vies-alerts');
  expect(request.method).toBe('POST');
  expect(request.headers.get('title')).toBe('VIES VAT checker error');
  expect(request.headers.get('priority')).toBe('high');
  expect(request.headers.get('tags')).toBe('rotating_light');
  expect(request.headers.get('authorization')).toBe('Bearer secret-token');
  expect(await request.text()).toBe(
    "There was an error while processing VAT number 'PL1234567890': unexpected parser failure"
  );
});

test('ntfy admin notifier throws on non-2xx responses', async () => {
  const notifier = createNtfyAdminNotifier({
    url: 'https://ntfy.example.com',
    topic: 'vies-alerts',
    fetch: async () => new Response('nope', { status: 500 })
  });

  await expect(notifier.notify(notification)).rejects.toThrow(
    'ntfy notification failed: 500'
  );
});

test('fan-out notifier calls every notifier and logs channel failures', async () => {
  const calls: string[] = [];
  const errors: unknown[][] = [];
  const notifier = createFanOutAdminNotifier({
    logger: {
      error: (...args: unknown[]) => errors.push(args)
    },
    notifiers: [
      {
        name: 'first',
        notifier: {
          notify: async () => {
            calls.push('first');
          }
        }
      },
      {
        name: 'second',
        notifier: {
          notify: async () => {
            calls.push('second');
            throw new Error('second failed');
          }
        }
      },
      {
        name: 'third',
        notifier: {
          notify: async () => {
            calls.push('third');
          }
        }
      }
    ]
  });

  await notifier.notify(notification);

  expect(calls).toEqual(['first', 'second', 'third']);
  expect(errors[0]?.[0]).toBe('[admin-notification]');
  expect(errors[0]?.[1]).toBe('second failed');
});
