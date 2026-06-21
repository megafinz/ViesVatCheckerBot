import { expect, test } from 'bun:test';
import { buildDatabaseUrl, createBackendRuntime } from './index';

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
      removeAllVatRequests: async () => true
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
