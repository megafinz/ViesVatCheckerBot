import { expect, test } from 'bun:test';
import type { PendingVatRequest, VatRequest } from '@viesvatchecker/core';
import { type AdminRepository, createAdminRoutes } from './admin-routes';

const pendingVatRequest: PendingVatRequest = {
  telegramChatId: '123',
  countryCode: 'AA',
  vatNumber: '12345678',
  expirationDate: new Date('2026-09-19T00:00:00.000Z')
};

const secondPendingVatRequest: PendingVatRequest = {
  telegramChatId: '456',
  countryCode: 'BB',
  vatNumber: '87654321',
  expirationDate: new Date('2026-09-20T00:00:00.000Z')
};

function createRepository(): AdminRepository {
  const vatRequests: PendingVatRequest[] = [];
  const errors = [
    {
      id: 'error-1',
      vatRequest: pendingVatRequest,
      error: 'Oops 1'
    },
    {
      id: 'error-2',
      vatRequest: secondPendingVatRequest,
      error: 'Oops 2'
    }
  ];

  return {
    async getAllVatRequests() {
      return vatRequests;
    },
    async getAllVatRequestErrors() {
      return errors;
    },
    async removeVatRequestError(errorId) {
      const index = errors.findIndex((error) => error.id === errorId);
      if (index === -1) {
        return false;
      }
      errors.splice(index, 1);
      return true;
    },
    async resolveVatRequestError(errorId) {
      const removed = await this.removeVatRequestError(errorId);
      if (!removed) {
        return { type: 'error-not-found' };
      }

      if (errorId === 'error-1') {
        vatRequests.push(pendingVatRequest);
        return {
          type: 'all-errors-resolved-and-vat-request-monitoring-is-resumed',
          vatRequest: pendingVatRequest
        };
      }

      return { type: 'error-resolved', vatRequest: secondPendingVatRequest };
    },
    async updateVatRequest(request: VatRequest, update) {
      const existing = vatRequests.find(
        (vatRequest) =>
          vatRequest.telegramChatId === request.telegramChatId &&
          vatRequest.countryCode === request.countryCode &&
          vatRequest.vatNumber === request.vatNumber
      );
      if (!existing) {
        return false;
      }

      existing.countryCode = update.countryCode;
      existing.vatNumber = update.vatNumber;
      return true;
    }
  };
}

test('rejects internal admin requests without the bearer token', async () => {
  const app = createAdminRoutes({
    internalApiToken: 'secret',
    repository: createRepository(),
    telegram: { sendMessage: async () => {} }
  });

  const response = await app.handle(
    new Request('http://localhost/internal/admin/vat-requests')
  );

  expect(response.status).toBe(401);
});

test('lists pending VAT requests for authenticated admin requests', async () => {
  const repository = createRepository();
  const app = createAdminRoutes({
    internalApiToken: 'secret',
    repository,
    telegram: { sendMessage: async () => {} }
  });

  await repository.resolveVatRequestError('error-1');
  const response = await app.handle(
    adminRequest('http://localhost/internal/admin/vat-requests')
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([
    {
      ...pendingVatRequest,
      expirationDate: pendingVatRequest.expirationDate.toISOString()
    }
  ]);
});

test('lists VAT request errors for authenticated admin requests', async () => {
  const app = createAdminRoutes({
    internalApiToken: 'secret',
    repository: createRepository(),
    telegram: { sendMessage: async () => {} }
  });

  const response = await app.handle(
    adminRequest('http://localhost/internal/admin/vat-request-errors')
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([
    {
      id: 'error-1',
      vatRequest: {
        ...pendingVatRequest,
        expirationDate: pendingVatRequest.expirationDate.toISOString()
      },
      error: 'Oops 1'
    },
    {
      id: 'error-2',
      vatRequest: {
        ...secondPendingVatRequest,
        expirationDate: secondPendingVatRequest.expirationDate.toISOString()
      },
      error: 'Oops 2'
    }
  ]);
});

test('resolves one VAT request error and notifies the user when monitoring resumes', async () => {
  const messages: Array<{ chatId: string; text: string }> = [];
  const repository = createRepository();
  const app = createAdminRoutes({
    internalApiToken: 'secret',
    repository,
    telegram: {
      sendMessage: async (chatId, text) => {
        messages.push({ chatId, text });
      }
    }
  });

  const response = await app.handle(
    adminRequest('http://localhost/internal/admin/vat-request-errors/error-1', {
      method: 'POST'
    })
  );

  expect(response.status).toBe(204);
  expect(messages).toEqual([
    {
      chatId: '123',
      text: "We resumed monitoring your VAT number 'AA12345678'."
    }
  ]);
});

test('does not notify the user when resolving an error silently', async () => {
  const messages: Array<{ chatId: string; text: string }> = [];
  const app = createAdminRoutes({
    internalApiToken: 'secret',
    repository: createRepository(),
    telegram: {
      sendMessage: async (chatId, text) => {
        messages.push({ chatId, text });
      }
    }
  });

  const response = await app.handle(
    adminRequest(
      'http://localhost/internal/admin/vat-request-errors/error-1/resolve?silent=true',
      { method: 'POST' }
    )
  );

  expect(response.status).toBe(204);
  expect(messages).toEqual([]);
});

test('returns 404 when resolving an unknown VAT request error', async () => {
  const app = createAdminRoutes({
    internalApiToken: 'secret',
    repository: createRepository(),
    telegram: { sendMessage: async () => {} }
  });

  const response = await app.handle(
    adminRequest('http://localhost/internal/admin/vat-request-errors/missing', {
      method: 'POST'
    })
  );

  expect(response.status).toBe(404);
  expect(await response.text()).toBe(
    "VAT Request Error with id 'missing' not found"
  );
});

test('removes one VAT request error', async () => {
  const app = createAdminRoutes({
    internalApiToken: 'secret',
    repository: createRepository(),
    telegram: { sendMessage: async () => {} }
  });

  const response = await app.handle(
    adminRequest('http://localhost/internal/admin/vat-request-errors/error-1', {
      method: 'DELETE'
    })
  );

  expect(response.status).toBe(204);
});

test('resolves all VAT request errors', async () => {
  const repository = createRepository();
  const app = createAdminRoutes({
    internalApiToken: 'secret',
    repository,
    telegram: { sendMessage: async () => {} }
  });

  const response = await app.handle(
    adminRequest('http://localhost/internal/admin/vat-request-errors/resolve', {
      method: 'POST'
    })
  );

  expect(response.status).toBe(204);
  expect(await repository.getAllVatRequestErrors()).toEqual([]);
});

test('updates a pending VAT request number', async () => {
  const repository = createRepository();
  await repository.resolveVatRequestError('error-1');
  const app = createAdminRoutes({
    internalApiToken: 'secret',
    repository,
    telegram: { sendMessage: async () => {} }
  });

  const response = await app.handle(
    adminRequest('http://localhost/internal/admin/vat-requests', {
      body: JSON.stringify({
        telegramChatId: '123',
        vatNumber: 'AA12345678',
        newVatNumber: 'BB87654321'
      }),
      method: 'PATCH'
    })
  );

  expect(response.status).toBe(204);
  expect(await repository.getAllVatRequests()).toEqual([
    {
      ...pendingVatRequest,
      countryCode: 'BB',
      vatNumber: '87654321'
    }
  ]);
});

test('rejects a VAT request update with a malformed VAT number', async () => {
  const repository = createRepository();
  await repository.resolveVatRequestError('error-1');
  const app = createAdminRoutes({
    internalApiToken: 'secret',
    repository,
    telegram: { sendMessage: async () => {} }
  });

  const response = await app.handle(
    adminRequest('http://localhost/internal/admin/vat-requests', {
      body: JSON.stringify({
        telegramChatId: '123',
        vatNumber: 'AA12345678',
        newVatNumber: 'BB12-34'
      }),
      method: 'PATCH'
    })
  );

  expect(response.status).toBe(400);
  expect(await response.text()).toBe(
    "VAT number 'BB12-34' contains invalid characters."
  );
  expect(await repository.getAllVatRequests()).toEqual([pendingVatRequest]);
});

function adminRequest(url: string, init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: {
      authorization: 'Bearer secret',
      'content-type': 'application/json',
      ...init.headers
    }
  });
}
