import { beforeEach, describe, expect, test } from 'bun:test';
import {
  type AdminNotification,
  type PendingVatRequest,
  processPendingVatRequests,
  type VatRequestError,
  ViesError
} from './index';

const pendingVatRequest: PendingVatRequest = {
  telegramChatId: '123',
  countryCode: 'XX',
  vatNumber: '123',
  expirationDate: new Date('2026-07-01T00:00:00.000Z')
};

type SentAdminNotification = AdminNotification;
type StoredVatRequestError = VatRequestError;

function baseJobDeps(
  repository: PendingVatJobRepository,
  sentMessages: Array<{ telegramChatId: string; message: string }>
) {
  return {
    repository,
    telegram: {
      sendMessage: async (telegramChatId: string, message: string) => {
        sentMessages.push({ telegramChatId, message });
      }
    },
    now: () => new Date('2026-06-21T00:00:00.000Z')
  };
}

class PendingVatJobRepository {
  requests: PendingVatRequest[] = [];
  errors: Array<{ request: PendingVatRequest; message: string }> = [];

  async getAllVatRequests() {
    return this.requests;
  }

  async removeVatRequest(request: PendingVatRequest) {
    this.requests = this.requests.filter((item) => item !== request);
    return true;
  }

  async demoteVatRequestToError(
    request: PendingVatRequest,
    message: string
  ): Promise<StoredVatRequestError | null> {
    this.errors.push({ request, message });
    await this.removeVatRequest(request);
    return { id: 'error-1', vatRequest: request, error: message };
  }
}

describe('processPendingVatRequests', () => {
  let repository: PendingVatJobRepository;
  let sentMessages: Array<{ telegramChatId: string; message: string }>;

  beforeEach(() => {
    repository = new PendingVatJobRepository();
    sentMessages = [];
  });

  test('removes a pending VAT request and notifies the user when it becomes valid', async () => {
    repository.requests.push(pendingVatRequest);

    const result = await processPendingVatRequests({
      repository,
      vies: { checkVatNumber: async () => ({ valid: true }) },
      telegram: {
        sendMessage: async (telegramChatId, message) => {
          sentMessages.push({ telegramChatId, message });
        }
      },
      now: () => new Date('2026-06-21T00:00:00.000Z')
    });

    expect(result).toEqual({ type: 'processed', processedCount: 1 });
    expect(repository.requests).toEqual([]);
    expect(sentMessages).toEqual([
      {
        telegramChatId: '123',
        message: "🟢 Congratulations, VAT number 'XX123' is now VALID!"
      }
    ]);
  });

  test('removes an expired invalid VAT request, notifies the user, and stops processing further requests', async () => {
    const secondRequest = {
      telegramChatId: '456',
      countryCode: 'YY',
      vatNumber: '999',
      expirationDate: new Date('2026-07-01T00:00:00.000Z')
    };
    repository.requests.push(pendingVatRequest, secondRequest);

    const result = await processPendingVatRequests({
      repository,
      vies: { checkVatNumber: async () => ({ valid: false }) },
      telegram: {
        sendMessage: async (telegramChatId, message) => {
          sentMessages.push({ telegramChatId, message });
        }
      },
      now: () => new Date('2026-07-02T00:00:00.000Z')
    });

    expect(result).toEqual({ type: 'processed', processedCount: 2 });
    expect(repository.requests).toEqual([secondRequest]);
    expect(sentMessages).toEqual([
      {
        telegramChatId: '123',
        message:
          "🔴 Your VAT number 'XX123' is no longer monitored because it's still invalid and it's been too long since you registered it. Make sure you entered the right VAT number or that the entity that this VAT number belongs to actually applied for registration in VIES."
      }
    ]);
  });

  test('leaves an invalid unexpired VAT request pending without notifying the user', async () => {
    repository.requests.push(pendingVatRequest);

    const result = await processPendingVatRequests({
      repository,
      vies: { checkVatNumber: async () => ({ valid: false }) },
      telegram: {
        sendMessage: async (telegramChatId, message) => {
          sentMessages.push({ telegramChatId, message });
        }
      },
      now: () => new Date('2026-06-21T00:00:00.000Z')
    });

    expect(result).toEqual({ type: 'processed', processedCount: 1 });
    expect(repository.requests).toEqual([pendingVatRequest]);
    expect(sentMessages).toEqual([]);
  });

  test('stops processing without demoting the request when VIES returns a recoverable error', async () => {
    repository.requests.push(pendingVatRequest);

    const result = await processPendingVatRequests({
      repository,
      vies: {
        checkVatNumber: async () => {
          throw new ViesError('bla bla TIMEOUT bla bla');
        }
      },
      telegram: {
        sendMessage: async (telegramChatId, message) => {
          sentMessages.push({ telegramChatId, message });
        }
      },
      now: () => new Date('2026-06-21T00:00:00.000Z')
    });

    expect(result).toEqual({ type: 'stopped-on-recoverable-error' });
    expect(repository.requests).toEqual([pendingVatRequest]);
    expect(repository.errors).toEqual([]);
    expect(sentMessages).toEqual([]);
  });

  test('demotes a request and emits a structured admin notification after an unrecoverable error', async () => {
    repository.requests.push(pendingVatRequest);
    const adminNotifications: SentAdminNotification[] = [];

    const result = await processPendingVatRequests({
      ...baseJobDeps(repository, sentMessages),
      vies: {
        checkVatNumber: async () => {
          throw new Error('unexpected parser failure');
        }
      },
      adminNotifier: {
        notify: async (notification) => {
          adminNotifications.push(notification);
        }
      }
    });

    expect(result).toEqual({
      type: 'processed-with-unrecoverable-errors',
      processedCount: 1
    });
    expect(repository.requests).toEqual([]);
    expect(repository.errors).toEqual([
      { request: pendingVatRequest, message: 'unexpected parser failure' }
    ]);
    expect(sentMessages).toEqual([
      {
        telegramChatId: '123',
        message:
          "🔴 Sorry, something went wrong and we had to stop monitoring the VAT number 'XX123'. We'll investigate what happened and try to resume monitoring. We'll notify you when that happens. Sorry for the inconvenience."
      }
    ]);
    expect(adminNotifications).toEqual([
      {
        type: 'pending-vat-unrecoverable-error',
        severity: 'error',
        vatNumber: 'XX123',
        errorMessage: 'unexpected parser failure',
        request: pendingVatRequest
      }
    ]);
  });

  test('does not require an admin notifier for unrecoverable errors', async () => {
    repository.requests.push(pendingVatRequest);

    const result = await processPendingVatRequests({
      ...baseJobDeps(repository, sentMessages),
      vies: {
        checkVatNumber: async () => {
          throw new Error('unexpected parser failure');
        }
      }
    });

    expect(result).toEqual({
      type: 'processed-with-unrecoverable-errors',
      processedCount: 1
    });
    expect(repository.errors).toEqual([
      { request: pendingVatRequest, message: 'unexpected parser failure' }
    ]);
    expect(sentMessages.map((message) => message.telegramChatId)).toEqual([
      '123'
    ]);
  });

  test('continues processing when the admin notifier fails', async () => {
    repository.requests.push(pendingVatRequest);

    const result = await processPendingVatRequests({
      ...baseJobDeps(repository, sentMessages),
      vies: {
        checkVatNumber: async () => {
          throw new Error('unexpected parser failure');
        }
      },
      adminNotifier: {
        notify: async () => {
          throw new Error('admin channel failed');
        }
      }
    });

    expect(result).toEqual({
      type: 'processed-with-unrecoverable-errors',
      processedCount: 1
    });
    expect(repository.errors).toEqual([
      { request: pendingVatRequest, message: 'unexpected parser failure' }
    ]);
    expect(sentMessages.map((message) => message.telegramChatId)).toEqual([
      '123'
    ]);
  });

  test('skips the user and admin notification when the request was already demoted', async () => {
    repository.requests.push(pendingVatRequest);
    const adminNotifications: SentAdminNotification[] = [];
    const originalDemote = repository.demoteVatRequestToError.bind(repository);
    repository.demoteVatRequestToError = async (request, message) => {
      await originalDemote(request, message);
      return null;
    };

    const result = await processPendingVatRequests({
      ...baseJobDeps(repository, sentMessages),
      vies: {
        checkVatNumber: async () => {
          throw new Error('unexpected parser failure');
        }
      },
      adminNotifier: {
        notify: async (notification) => {
          adminNotifications.push(notification);
        }
      }
    });

    expect(result).toEqual({
      type: 'processed-with-unrecoverable-errors',
      processedCount: 1
    });
    expect(sentMessages).toEqual([]);
    expect(adminNotifications).toEqual([]);
  });
});
