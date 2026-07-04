import { expect, test } from 'bun:test';
import type {
  TelegramMessenger,
  TelegramPollingApi,
  TelegramWebhookApi
} from '@viesvatchecker/adapters';
import { buildDatabaseUrl, createBackendRuntime, startBackend } from './index';

function createStubTelegram(): TelegramPollingApi &
  TelegramWebhookApi &
  TelegramMessenger {
  return {
    deleteWebhook: async () => {},
    getUpdates: async () => [],
    sendMessage: async () => {},
    setWebhook: async () => {}
  };
}

const baseConfig = {
  expirationDays: 90,
  maxPendingPerUser: 10,
  pollingIntervalMs: 1000,
  transport: 'long-polling' as const,
  webhook: { path: '/telegram/webhook' }
};

const baseRepository = {
  tryAddUniqueVatRequest: async (request: {
    telegramChatId: string;
    countryCode: string;
    vatNumber: string;
  }) => ({
    ...request,
    expirationDate: new Date('2026-09-19T00:00:00.000Z')
  }),
  removeVatRequest: async () => false,
  countVatRequests: async () => 0,
  getAllVatRequests: async () => [],
  removeAllVatRequests: async () => true,
  getAllVatRequestErrors: async () => [],
  removeVatRequestError: async () => false,
  resolveVatRequestError: async () => ({ type: 'error-not-found' as const }),
  updateVatRequest: async () => false
};

const baseVies = { checkVatNumber: async () => ({ valid: false }) };

test('buildDatabaseUrl builds a postgres URL from backend config fields', () => {
  expect(
    buildDatabaseUrl({
      host: 'db',
      name: 'viesvatchecker',
      password: 'postgres password',
      port: 5432,
      user: 'backend'
    })
  ).toBe('postgres://backend:postgres%20password@db:5432/viesvatchecker');
});

test('createBackendRuntime creates the health app and reports the configured transport', async () => {
  const runtime = createBackendRuntime({
    config: baseConfig,
    repository: baseRepository,
    telegram: createStubTelegram(),
    vies: baseVies
  });

  const response = await runtime.app.handle(
    new Request('http://localhost/health')
  );

  expect(await response.json()).toEqual({
    ok: true,
    service: 'viesvatchecker-backend',
    telegramTransport: 'long-polling'
  });
  expect(runtime.stop).toBeTypeOf('function');
});

test('createBackendRuntime exposes internal admin routes', async () => {
  const runtime = createBackendRuntime({
    config: baseConfig,
    repository: {
      ...baseRepository,
      getAllVatRequests: async () => [
        {
          telegramChatId: '123',
          countryCode: 'AA',
          vatNumber: '12345678',
          expirationDate: new Date('2026-09-19T00:00:00.000Z')
        }
      ]
    },
    telegram: createStubTelegram(),
    vies: baseVies
  });

  const response = await runtime.app.handle(
    new Request('http://localhost/internal/admin/vat-requests')
  );

  expect(response.status).toBe(200);
});

test('long-polling transport calls deleteWebhook and getUpdates', async () => {
  let deleteWebhookCalls = 0;
  let getUpdatesCalls = 0;

  const runtime = createBackendRuntime({
    config: { ...baseConfig, pollingIntervalMs: 5 },
    repository: baseRepository,
    telegram: {
      ...createStubTelegram(),
      deleteWebhook: async () => {
        deleteWebhookCalls += 1;
      },
      getUpdates: async () => {
        getUpdatesCalls += 1;
        return [];
      }
    },
    vies: baseVies
  });

  await runtime.transport.start();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await runtime.stop();

  expect(deleteWebhookCalls).toBeGreaterThan(0);
  expect(getUpdatesCalls).toBeGreaterThan(0);
});

test('long-polling transport backs off when Telegram polling keeps failing', async () => {
  const start = Date.now();
  let calls = 0;

  const runtime = createBackendRuntime({
    config: { ...baseConfig, pollingIntervalMs: 5 },
    repository: baseRepository,
    telegram: {
      ...createStubTelegram(),
      getUpdates: async () => {
        calls += 1;
        throw new Error('Telegram is down');
      }
    },
    vies: baseVies
  });

  await runtime.transport.start();
  await new Promise((resolve) => setTimeout(resolve, 80));
  await runtime.stop();
  const elapsed = Date.now() - start;

  // After the first failure the next attempt is delayed (5ms interval * 2 = 10ms),
  // then 20ms, then 40ms. With ~80ms of wall-clock time we expect at most a handful
  // of attempts rather than the ~16 that immediate retries would produce.
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThan(8);
  expect(elapsed).toBeGreaterThan(0);
});

test('webhook transport mounts a route, auto-registers, and validates the secret', async () => {
  const setWebhookCalls: Array<{ secretToken?: string; url: string }> = [];
  const deleteWebhookCalls: string[] = [];

  const runtime = createBackendRuntime({
    config: {
      ...baseConfig,
      transport: 'webhook',
      webhook: {
        path: '/telegram/webhook',
        secretToken: 'topsecret',
        url: 'https://bot.example.com/telegram/webhook'
      }
    },
    repository: baseRepository,
    telegram: {
      ...createStubTelegram(),
      setWebhook: async (request) => {
        setWebhookCalls.push(request);
      },
      deleteWebhook: async () => {
        deleteWebhookCalls.push('called');
      }
    },
    vies: baseVies
  });

  await runtime.transport.start();

  expect(setWebhookCalls).toEqual([
    {
      secretToken: 'topsecret',
      url: 'https://bot.example.com/telegram/webhook'
    }
  ]);

  const bad = await runtime.app.handle(
    new Request('http://localhost/telegram/webhook', {
      body: JSON.stringify({ update_id: 1 }),
      headers: { 'content-type': 'application/json' },
      method: 'POST'
    })
  );
  expect(bad.status).toBe(401);

  const ok = await runtime.app.handle(
    new Request('http://localhost/telegram/webhook', {
      body: JSON.stringify({
        update_id: 7,
        message: { chat: { id: 1 }, text: '/list' }
      }),
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'topsecret'
      },
      method: 'POST'
    })
  );
  expect(ok.status).toBe(200);

  await runtime.stop();
  expect(deleteWebhookCalls).toEqual(['called']);
});

test('startBackend starts without running database migrations', async () => {
  const closed: string[] = [];
  const runtime = await startBackend(
    {
      DATABASE_HOST: 'db',
      DATABASE_NAME: 'viesvatchecker',
      DATABASE_PASSWORD: 'runtime-secret',
      DATABASE_PORT: '5432',
      DATABASE_USER: 'viesvatchecker_runtime',
      HOST: '127.0.0.1',
      PORT: '18080',
      TG_BOT_TOKEN: 'telegram-token',
      TG_TRANSPORT: 'long-polling',
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
      createRepository: () => baseRepository,
      createTelegram: () => createStubTelegram(),
      createVies: () => baseVies,
      listen: (_app, options) => {
        expect(options).toEqual({ hostname: '127.0.0.1', port: 18080 });
        return {
          stop: async () => {}
        };
      }
    }
  );

  await runtime.stop();

  expect(closed).toEqual(['close']);
});
