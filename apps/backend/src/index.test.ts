import { expect, test } from 'bun:test';
import { buildDatabaseUrl, createBackendRuntime, startBackend } from './index';

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

test('createBackendRuntime creates the health app and leaves polling stopped when disabled', async () => {
  const runtime = createBackendRuntime({
    config: {
      expirationDays: 90,
      internalApiToken: 'internal-token',
      maxPendingPerUser: 10,
      pollingEnabled: false,
      pollingIntervalMs: 1000
    },
    repository: {
      tryAddUniqueVatRequest: async (request) => ({
        ...request,
        expirationDate: new Date('2026-09-19T00:00:00.000Z')
      }),
      removeVatRequest: async () => false,
      countVatRequests: async () => 0,
      getAllVatRequests: async () => [],
      removeAllVatRequests: async () => true,
      getAllVatRequestErrors: async () => [],
      removeVatRequestError: async () => false,
      resolveVatRequestError: async () => ({ type: 'error-not-found' }),
      updateVatRequest: async () => false
    },
    telegram: {
      getUpdates: async () => [],
      sendMessage: async () => {}
    },
    vies: {
      checkVatNumber: async () => ({ valid: false })
    }
  });

  const response = await runtime.app.handle(
    new Request('http://localhost/health')
  );

  expect(await response.json()).toEqual({
    ok: true,
    service: 'viesvatchecker-backend',
    telegramPolling: false
  });
  expect(runtime.stop).toBeTypeOf('function');
});

test('createBackendRuntime exposes authenticated internal admin routes', async () => {
  const runtime = createBackendRuntime({
    config: {
      expirationDays: 90,
      internalApiToken: 'internal-token',
      maxPendingPerUser: 10,
      pollingEnabled: false,
      pollingIntervalMs: 1000
    },
    repository: {
      tryAddUniqueVatRequest: async (request) => ({
        ...request,
        expirationDate: new Date('2026-09-19T00:00:00.000Z')
      }),
      removeVatRequest: async () => false,
      countVatRequests: async () => 0,
      getAllVatRequests: async () => [
        {
          telegramChatId: '123',
          countryCode: 'AA',
          vatNumber: '12345678',
          expirationDate: new Date('2026-09-19T00:00:00.000Z')
        }
      ],
      removeAllVatRequests: async () => true,
      getAllVatRequestErrors: async () => [],
      removeVatRequestError: async () => false,
      resolveVatRequestError: async () => ({ type: 'error-not-found' }),
      updateVatRequest: async () => false
    },
    telegram: {
      getUpdates: async () => [],
      sendMessage: async () => {}
    },
    vies: {
      checkVatNumber: async () => ({ valid: false })
    }
  });

  const response = await runtime.app.handle(
    new Request('http://localhost/internal/admin/vat-requests', {
      headers: { authorization: 'Bearer internal-token' }
    })
  );

  expect(response.status).toBe(200);
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
      INTERNAL_API_TOKEN: 'internal-token',
      PORT: '18080',
      TG_BOT_TOKEN: 'telegram-token',
      TG_POLLING_ENABLED: 'false',
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
        tryAddUniqueVatRequest: async (request) => ({
          ...request,
          expirationDate: new Date('2026-09-19T00:00:00.000Z')
        }),
        removeVatRequest: async () => false,
        countVatRequests: async () => 0,
        getAllVatRequests: async () => [],
        removeAllVatRequests: async () => true,
        getAllVatRequestErrors: async () => [],
        removeVatRequestError: async () => false,
        resolveVatRequestError: async () => ({ type: 'error-not-found' }),
        updateVatRequest: async () => false
      }),
      createTelegram: () => ({
        getUpdates: async () => [],
        sendMessage: async () => {}
      }),
      createVies: () => ({
        checkVatNumber: async () => ({ valid: false })
      }),
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
