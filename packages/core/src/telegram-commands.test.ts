import { beforeEach, describe, expect, test } from 'bun:test';
import {
  checkVatRequest,
  listVatRequests,
  type PendingVatRequest,
  uncheckAllVatRequests,
  uncheckVatRequest,
  type VatRequest,
  ViesError
} from './index';

const vatRequest: VatRequest = {
  telegramChatId: '123',
  countryCode: 'XX',
  vatNumber: '123'
};

const config = {
  expirationDays: 90,
  maxPendingPerUser: 10
};

class MemoryVatRequestRepository {
  requests: PendingVatRequest[] = [];

  async tryAddUniqueVatRequest(request: VatRequest) {
    if (
      this.requests.some(
        (item) =>
          item.telegramChatId === request.telegramChatId &&
          item.countryCode === request.countryCode &&
          item.vatNumber === request.vatNumber
      )
    ) {
      return false;
    }

    const pendingRequest = {
      ...request,
      expirationDate: new Date('2026-09-19T00:00:00.000Z')
    };
    this.requests.push(pendingRequest);
    return pendingRequest;
  }

  async removeVatRequest(request: VatRequest) {
    const oldLength = this.requests.length;
    this.requests = this.requests.filter(
      (item) =>
        item.telegramChatId !== request.telegramChatId ||
        item.countryCode !== request.countryCode ||
        item.vatNumber !== request.vatNumber
    );
    return this.requests.length !== oldLength;
  }

  async removeAllVatRequests(telegramChatId: string) {
    this.requests = this.requests.filter(
      (request) => request.telegramChatId !== telegramChatId
    );
    return true;
  }

  async countVatRequests(telegramChatId: string) {
    return this.requests.filter(
      (request) => request.telegramChatId === telegramChatId
    ).length;
  }

  async getAllVatRequests(telegramChatId?: string) {
    return telegramChatId
      ? this.requests.filter(
          (request) => request.telegramChatId === telegramChatId
        )
      : this.requests;
  }
}

describe('checkVatRequest', () => {
  let repository: MemoryVatRequestRepository;

  beforeEach(() => {
    repository = new MemoryVatRequestRepository();
  });

  test('removes an existing pending request when VIES says the VAT number is valid', async () => {
    repository.requests.push({
      ...vatRequest,
      expirationDate: new Date('2026-09-19T00:00:00.000Z')
    });

    const result = await checkVatRequest(vatRequest, {
      repository,
      config,
      vies: { checkVatNumber: async () => ({ valid: true }) }
    });

    expect(result).toEqual({
      status: 200,
      body: {
        type: 'success',
        message: "🟢 VAT number 'XX123' is valid."
      }
    });
    expect(repository.requests).toEqual([]);
  });

  test('adds a unique pending request when VIES says the VAT number is not valid yet', async () => {
    const result = await checkVatRequest(vatRequest, {
      repository,
      config,
      vies: { checkVatNumber: async () => ({ valid: false }) }
    });

    expect(result.status).toBe(200);
    expect(result.body.message).toBe(
      "🕓 VAT number 'XX123' is not registered in VIES yet. We will monitor it for 90 days and notify you if it becomes valid (or if the monitoring period expires)."
    );
    expect(repository.requests).toHaveLength(1);
    expect(repository.requests[0]).toMatchObject(vatRequest);
  });

  test('rejects a new pending request when the chat already reached the configured limit', async () => {
    repository.requests = Array.from(
      { length: config.maxPendingPerUser },
      () => ({
        ...vatRequest,
        expirationDate: new Date('2026-09-19T00:00:00.000Z')
      })
    );

    const result = await checkVatRequest(vatRequest, {
      repository,
      config,
      vies: { checkVatNumber: async () => ({ valid: false }) }
    });

    expect(result.status).toBe(400);
    expect(result.body.message).toBe(
      '🔴 Sorry, you reached the limit of maximum VAT numbers you can monitor (10).'
    );
  });

  test('does not duplicate an existing pending request', async () => {
    repository.requests.push({
      ...vatRequest,
      expirationDate: new Date('2026-09-19T00:00:00.000Z')
    });

    const result = await checkVatRequest(vatRequest, {
      repository,
      config,
      vies: { checkVatNumber: async () => ({ valid: false }) }
    });

    expect(result.status).toBe(200);
    expect(repository.requests).toHaveLength(1);
  });

  test('returns a format error without adding a pending request when VIES rejects the input', async () => {
    const result = await checkVatRequest(vatRequest, {
      repository,
      config,
      vies: {
        checkVatNumber: async () => {
          throw new ViesError('bla bla INVALID_INPUT bla bla');
        }
      }
    });

    expect(result.status).toBe(400);
    expect(result.body.message).toContain(
      'Make sure it is in the correct format'
    );
    expect(repository.requests).toEqual([]);
  });

  test('keeps monitoring when VIES is temporarily unavailable', async () => {
    const result = await checkVatRequest(vatRequest, {
      repository,
      config,
      vies: {
        checkVatNumber: async () => {
          throw new ViesError('bla bla SERVICE_UNAVAILABLE bla bla');
        }
      }
    });

    expect(result.status).toBe(500);
    expect(result.body.message).toBe(
      "🟡 There was a problem validating your VAT number 'XX123' (looks like VIES validation service is not available right now). We'll keep monitoring it for a while."
    );
    expect(repository.requests).toHaveLength(1);
  });

  test('does not add a pending request when VIES fails with an unrecoverable unknown error', async () => {
    const result = await checkVatRequest(vatRequest, {
      repository,
      config,
      vies: {
        checkVatNumber: async () => {
          throw new ViesError('bla bla UNKNOWN bla bla');
        }
      }
    });

    expect(result.status).toBe(500);
    expect(result.body.message).toBe(
      "🔴 There was a problem validating your VAT number 'XX123'. Looks like VIES validation service is not working as expected. Please try again later."
    );
    expect(repository.requests).toEqual([]);
  });

  test('returns the generic technical difficulty message for non-VIES failures', async () => {
    const result = await checkVatRequest(vatRequest, {
      repository,
      config,
      vies: {
        checkVatNumber: async () => {
          throw new Error('database went away');
        }
      }
    });

    expect(result.status).toBe(500);
    expect(result.body.message).toBe(
      "🔴 We're having some technical difficulties processing your request, please try again later."
    );
    expect(repository.requests).toEqual([]);
  });
});

test('uncheckVatRequest removes the matching request and returns the legacy success message', async () => {
  const repository = new MemoryVatRequestRepository();
  repository.requests.push({
    ...vatRequest,
    expirationDate: new Date('2026-09-19T00:00:00.000Z')
  });

  const result = await uncheckVatRequest(vatRequest, { repository });

  expect(result.status).toBe(200);
  expect(result.body.message).toBe(
    "VAT number 'XX123' is no longer being monitored."
  );
  expect(repository.requests).toEqual([]);
});

test('listVatRequests returns monitored VAT numbers for the requested chat only', async () => {
  const repository = new MemoryVatRequestRepository();
  repository.requests.push(
    {
      ...vatRequest,
      expirationDate: new Date('2026-09-19T00:00:00.000Z')
    },
    {
      telegramChatId: '456',
      countryCode: 'YY',
      vatNumber: '999',
      expirationDate: new Date('2026-09-19T00:00:00.000Z')
    }
  );

  const result = await listVatRequests('123', { repository });

  expect(result.status).toBe(200);
  expect(result.body.message).toBe(
    "You monitor the following VAT numbers:\n\n'XX123'."
  );
});

test('listVatRequests returns the empty list message when the chat has no pending VAT numbers', async () => {
  const repository = new MemoryVatRequestRepository();

  const result = await listVatRequests('123', { repository });

  expect(result.status).toBe(200);
  expect(result.body.message).toBe('You are not monitoring any VAT numbers.');
});

test('uncheckAllVatRequests removes all pending VAT numbers for the requested chat', async () => {
  const repository = new MemoryVatRequestRepository();
  repository.requests.push(
    {
      ...vatRequest,
      expirationDate: new Date('2026-09-19T00:00:00.000Z')
    },
    {
      telegramChatId: '456',
      countryCode: 'YY',
      vatNumber: '999',
      expirationDate: new Date('2026-09-19T00:00:00.000Z')
    }
  );

  const result = await uncheckAllVatRequests('123', { repository });

  expect(result.status).toBe(200);
  expect(result.body.message).toBe('You no longer monitor any VAT numbers.');
  expect(repository.requests).toEqual([
    {
      telegramChatId: '456',
      countryCode: 'YY',
      vatNumber: '999',
      expirationDate: new Date('2026-09-19T00:00:00.000Z')
    }
  ]);
});
