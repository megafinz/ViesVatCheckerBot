import { expect, test } from 'bun:test';
import type { PendingVatRequest, VatRequest } from '@viesvatchecker/core';
import { createCoreVatRequestRepository } from './repository-adapter';

test('core repository adapter supplies expiration date when adding unique requests', async () => {
  const inserted: Array<{ request: VatRequest; expirationDate: Date }> = [];
  const adapter = createCoreVatRequestRepository({
    expirationDays: 90,
    now: () => new Date('2026-06-21T00:00:00.000Z'),
    repository: {
      tryAddUniqueVatRequest: async (
        request: VatRequest,
        expirationDate: Date
      ): Promise<PendingVatRequest> => {
        inserted.push({ request, expirationDate });
        return { ...request, expirationDate };
      },
      removeVatRequest: async () => false,
      countVatRequests: async () => 0,
      getAllVatRequests: async () => [],
      removeAllVatRequests: async () => true
    }
  });

  const request = {
    telegramChatId: '123',
    countryCode: 'PL',
    vatNumber: '1234567890'
  };

  await adapter.tryAddUniqueVatRequest(request);

  expect(inserted).toEqual([
    {
      request,
      expirationDate: new Date('2026-09-19T00:00:00.000Z')
    }
  ]);
});
