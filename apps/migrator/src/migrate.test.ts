import { describe, expect, test } from 'bun:test';
import { migrateVatData } from './migrate';
import type { PendingVatRequest, VatRequestErrorImport } from './types';

const pendingVatRequest: PendingVatRequest = {
  telegramChatId: '123',
  countryCode: 'PL',
  vatNumber: '1234567890',
  expirationDate: new Date('2026-09-19T00:00:00.000Z')
};

const vatRequestError: VatRequestErrorImport = {
  sourceId: 'error-1',
  vatRequest: {
    telegramChatId: '456',
    countryCode: 'DE',
    vatNumber: '999',
    expirationDate: new Date('2026-09-19T00:00:00.000Z')
  },
  error: 'boom'
};

describe('migrateVatData', () => {
  test('verify mode reports source and target counts without writing', async () => {
    const writes: string[] = [];

    const result = await migrateVatData({
      mode: 'verify',
      source: {
        getPendingVatRequests: async () => [pendingVatRequest],
        getVatRequestErrors: async () => [vatRequestError]
      },
      target: {
        countPendingVatRequests: async () => 2,
        countVatRequestErrors: async () => 3,
        insertPendingVatRequest: async () => {
          writes.push('pending');
          return true;
        },
        insertVatRequestError: async () => {
          writes.push('error');
        }
      }
    });

    expect(result).toEqual({
      mode: 'verify',
      source: { pendingVatRequests: 1, vatRequestErrors: 1 },
      targetBefore: { pendingVatRequests: 2, vatRequestErrors: 3 },
      targetAfter: { pendingVatRequests: 2, vatRequestErrors: 3 },
      inserted: { pendingVatRequests: 0, vatRequestErrors: 0 },
      skipped: { pendingVatRequests: 0 }
    });
    expect(writes).toEqual([]);
  });

  test('dry-run mode reports planned writes without writing', async () => {
    const result = await migrateVatData({
      mode: 'dry-run',
      source: {
        getPendingVatRequests: async () => [pendingVatRequest],
        getVatRequestErrors: async () => [vatRequestError]
      },
      target: createTarget()
    });

    expect(result.inserted).toEqual({
      pendingVatRequests: 1,
      vatRequestErrors: 1
    });
    expect(result.targetAfter).toEqual(result.targetBefore);
  });

  test('migrate mode writes pending requests and errors', async () => {
    const inserted: string[] = [];

    const result = await migrateVatData({
      mode: 'migrate',
      source: {
        getPendingVatRequests: async () => [pendingVatRequest],
        getVatRequestErrors: async () => [vatRequestError]
      },
      target: createTarget({
        insertPendingVatRequest: async () => {
          inserted.push('pending');
          return true;
        },
        insertVatRequestError: async () => {
          inserted.push('error');
        },
        countPendingVatRequests: async () =>
          inserted.filter((x) => x === 'pending').length,
        countVatRequestErrors: async () =>
          inserted.filter((x) => x === 'error').length
      })
    });

    expect(inserted).toEqual(['pending', 'error']);
    expect(result).toEqual({
      mode: 'migrate',
      source: { pendingVatRequests: 1, vatRequestErrors: 1 },
      targetBefore: { pendingVatRequests: 0, vatRequestErrors: 0 },
      targetAfter: { pendingVatRequests: 1, vatRequestErrors: 1 },
      inserted: { pendingVatRequests: 1, vatRequestErrors: 1 },
      skipped: { pendingVatRequests: 0 }
    });
  });

  test('migrate mode reports duplicate pending requests as skipped', async () => {
    const result = await migrateVatData({
      mode: 'migrate',
      source: {
        getPendingVatRequests: async () => [pendingVatRequest],
        getVatRequestErrors: async () => []
      },
      target: createTarget({
        insertPendingVatRequest: async () => false
      })
    });

    expect(result.inserted.pendingVatRequests).toBe(0);
    expect(result.skipped.pendingVatRequests).toBe(1);
  });
});

function createTarget(
  overrides: Partial<Parameters<typeof migrateVatData>[0]['target']> = {}
): Parameters<typeof migrateVatData>[0]['target'] {
  return {
    countPendingVatRequests: async () => 0,
    countVatRequestErrors: async () => 0,
    insertPendingVatRequest: async () => true,
    insertVatRequestError: async () => {},
    ...overrides
  };
}
