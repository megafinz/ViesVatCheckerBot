import { describe, expect, test } from 'bun:test';
import { createPostgresMigrationTarget } from './postgres-target';
import type { PendingVatRequest, VatRequestErrorImport } from './types';

const pendingVatRequest: PendingVatRequest = {
  telegramChatId: '123',
  countryCode: 'PL',
  vatNumber: '1234567890',
  expirationDate: new Date('2026-09-19T00:00:00.000Z')
};

const vatRequestError: VatRequestErrorImport = {
  sourceId: 'error-1',
  vatRequest: pendingVatRequest,
  error: 'boom'
};

describe('createPostgresMigrationTarget', () => {
  test('counts target pending requests and errors', async () => {
    const target = createPostgresMigrationTarget({
      vatRequests: {
        getAllVatRequests: async () => [pendingVatRequest],
        tryAddUniqueVatRequest: async () => pendingVatRequest
      },
      vatRequestErrors: {
        getAllVatRequestErrors: async () => [
          { id: '1', vatRequest: pendingVatRequest, error: 'boom' }
        ],
        addVatRequestError: async () => ({
          id: '1',
          vatRequest: pendingVatRequest,
          error: 'boom'
        })
      }
    });

    expect(await target.countPendingVatRequests()).toBe(1);
    expect(await target.countVatRequestErrors()).toBe(1);
  });

  test('inserts pending requests through try-add so reruns can skip duplicates', async () => {
    const inserted: PendingVatRequest[] = [];
    const target = createPostgresMigrationTarget({
      vatRequests: {
        getAllVatRequests: async () => [],
        tryAddUniqueVatRequest: async (vatRequest, expirationDate) => {
          inserted.push({ ...vatRequest, expirationDate });
          return { ...vatRequest, expirationDate };
        }
      },
      vatRequestErrors: {
        getAllVatRequestErrors: async () => [],
        addVatRequestError: async () => ({
          id: '1',
          vatRequest: pendingVatRequest,
          error: 'boom'
        })
      }
    });

    expect(await target.insertPendingVatRequest(pendingVatRequest)).toBe(true);
    expect(inserted).toEqual([pendingVatRequest]);
  });

  test('returns false when pending request already exists', async () => {
    const target = createPostgresMigrationTarget({
      vatRequests: {
        getAllVatRequests: async () => [],
        tryAddUniqueVatRequest: async () => false
      },
      vatRequestErrors: {
        getAllVatRequestErrors: async () => [],
        addVatRequestError: async () => ({
          id: '1',
          vatRequest: pendingVatRequest,
          error: 'boom'
        })
      }
    });

    expect(await target.insertPendingVatRequest(pendingVatRequest)).toBe(false);
  });

  test('inserts VAT request errors without using the Mongo source id', async () => {
    const inserted: Array<{ request: PendingVatRequest; error: string }> = [];
    const target = createPostgresMigrationTarget({
      vatRequests: {
        getAllVatRequests: async () => [],
        tryAddUniqueVatRequest: async () => false
      },
      vatRequestErrors: {
        getAllVatRequestErrors: async () => [],
        addVatRequestError: async (request, error) => {
          inserted.push({ request, error });
          return { id: 'postgres-id', vatRequest: request, error };
        }
      }
    });

    await target.insertVatRequestError(vatRequestError);

    expect(inserted).toEqual([
      {
        request: pendingVatRequest,
        error: 'boom'
      }
    ]);
  });
});
