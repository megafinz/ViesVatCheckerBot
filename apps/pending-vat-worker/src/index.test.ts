import { expect, test } from 'bun:test';
import type { PendingVatRequest } from '@viesvatchecker/core';
import {
  createPendingVatWorkerRuntime,
  runPendingVatWorker,
  startPendingVatWorker
} from './index';

test('runPendingVatWorker processes pending requests with worker dependencies', async () => {
  const request: PendingVatRequest = {
    telegramChatId: '123',
    countryCode: 'PL',
    vatNumber: '1234567890',
    expirationDate: new Date('2026-07-01T00:00:00.000Z')
  };
  const removedRequests: PendingVatRequest[] = [];
  const sentMessages: Array<{ chatId: string; text: string }> = [];

  const result = await runPendingVatWorker({
    now: () => new Date('2026-06-21T00:00:00.000Z'),
    repository: {
      getAllVatRequests: async () => [request],
      removeVatRequest: async (vatRequest) => {
        removedRequests.push(vatRequest);
        return true;
      },
      demoteVatRequestToError: async () => null
    },
    telegram: {
      sendMessage: async (chatId, text) => {
        sentMessages.push({ chatId, text });
      }
    },
    vies: {
      checkVatNumber: async () => ({ valid: true })
    }
  });

  expect(result).toEqual({ type: 'processed', processedCount: 1 });
  expect(removedRequests).toEqual([request]);
  expect(sentMessages).toEqual([
    {
      chatId: '123',
      text: "🟢 Congratulations, VAT number 'PL1234567890' is now VALID!"
    }
  ]);
});

test('createPendingVatWorkerRuntime builds a logger admin notifier when configured', async () => {
  const adminLogs: unknown[][] = [];

  const runtime = createPendingVatWorkerRuntime({
    config: {
      adminNotifications: {
        channels: ['logger'],
        telegram: {
          chatIds: []
        },
        ntfy: {
          token: undefined,
          topic: undefined,
          url: undefined
        }
      }
    },
    logger: {
      error: (...args: unknown[]) => adminLogs.push(args)
    },
    repository: {
      getAllVatRequests: async () => [
        {
          telegramChatId: '123',
          countryCode: 'PL',
          vatNumber: '1234567890',
          expirationDate: new Date('2026-07-01T00:00:00.000Z')
        }
      ],
      removeVatRequest: async () => false,
      demoteVatRequestToError: async () => null
    },
    telegram: {
      sendMessage: async () => {}
    },
    vies: {
      checkVatNumber: async () => {
        throw new Error('boom');
      }
    }
  });

  const result = await runtime.run();

  expect(result).toEqual({
    type: 'processed-with-unrecoverable-errors',
    processedCount: 1
  });
  expect(adminLogs[0]).toEqual([
    '[admin-notification]',
    'VIES VAT checker error',
    "There was an error while processing VAT number 'PL1234567890': boom"
  ]);
});

test('createPendingVatWorkerRuntime builds telegram and ntfy admin notifiers when configured', async () => {
  const sentMessages: Array<{ chatId: string; text: string }> = [];
  const ntfyRequests: Request[] = [];

  const runtime = createPendingVatWorkerRuntime({
    config: {
      adminNotifications: {
        channels: ['telegram', 'ntfy'],
        telegram: {
          chatIds: ['admin-1', 'admin-2']
        },
        ntfy: {
          token: 'ntfy-token',
          topic: 'vies-alerts',
          url: 'https://ntfy.example.com'
        }
      }
    },
    fetch: async (request) => {
      ntfyRequests.push(request);
      return new Response('', { status: 200 });
    },
    repository: {
      getAllVatRequests: async () => [
        {
          telegramChatId: '123',
          countryCode: 'PL',
          vatNumber: '1234567890',
          expirationDate: new Date('2026-07-01T00:00:00.000Z')
        }
      ],
      removeVatRequest: async () => false,
      demoteVatRequestToError: async () => null
    },
    telegram: {
      sendMessage: async (chatId, text) => {
        sentMessages.push({ chatId, text });
      }
    },
    vies: {
      checkVatNumber: async () => {
        throw new Error('boom');
      }
    }
  });

  await runtime.run();

  expect(sentMessages.map((message) => message.chatId)).toEqual([
    '123',
    'admin-1',
    'admin-2'
  ]);
  expect(ntfyRequests).toHaveLength(1);
  expect(ntfyRequests[0].url).toBe('https://ntfy.example.com/vies-alerts');
});

test('startPendingVatWorker runs without database migrations', async () => {
  const closed: string[] = [];

  const result = await startPendingVatWorker(
    {
      ADMIN_NOTIFICATION_CHANNELS: 'logger',
      DATABASE_HOST: 'db',
      DATABASE_NAME: 'viesvatchecker',
      DATABASE_PASSWORD: 'runtime-secret',
      DATABASE_PORT: '5432',
      DATABASE_USER: 'viesvatchecker_runtime',
      INTERNAL_API_TOKEN: 'internal-token',
      TG_BOT_TOKEN: 'telegram-token',
      VIES_URL: 'https://example.com/vies.wsdl'
    },
    {
      createPostgresClient: (url) => {
        expect(url).toBe(
          'postgres://viesvatchecker_runtime:runtime-secret@db:5432/viesvatchecker'
        );
        return {
          db: {},
          close: async () => {
            closed.push('close');
          }
        };
      },
      createRepository: () => ({
        getAllVatRequests: async () => [],
        removeVatRequest: async () => false,
        demoteVatRequestToError: async () => null
      }),
      createTelegram: () => ({
        sendMessage: async () => {}
      }),
      createVies: () => ({
        checkVatNumber: async () => ({ valid: false })
      })
    }
  );

  expect(result).toEqual({ type: 'processed', processedCount: 0 });
  expect(closed).toEqual(['close']);
});
