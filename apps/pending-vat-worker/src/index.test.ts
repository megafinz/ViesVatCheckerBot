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
    config: {
      adminTelegramChatId: undefined,
      notifyAdminOnUnrecoverableErrors: false
    },
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

test('createPendingVatWorkerRuntime maps config into pending job config', async () => {
  const sentMessages: Array<{ chatId: string; text: string }> = [];

  const runtime = createPendingVatWorkerRuntime({
    config: {
      admin: {
        notifyOnUnrecoverableErrors: true,
        telegramChatId: 'admin'
      }
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

  const result = await runtime.run();

  expect(result).toEqual({
    type: 'processed-with-unrecoverable-errors',
    processedCount: 1
  });
  expect(sentMessages.map((message) => message.chatId)).toEqual([
    '123',
    'admin'
  ]);
});

test('startPendingVatWorker runs without database migrations', async () => {
  const closed: string[] = [];

  const result = await startPendingVatWorker(
    {
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
