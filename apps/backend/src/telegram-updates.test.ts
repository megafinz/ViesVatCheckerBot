import { describe, expect, test } from 'bun:test';
import type {
  PendingVatRequest,
  VatRequest,
  VatValidationResult
} from '@viesvatchecker/core';
import { handleTelegramUpdate } from './telegram-updates';

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

function createDeps(viesResult: VatValidationResult = { valid: false }) {
  const repository = new MemoryVatRequestRepository();
  const sentMessages: Array<{ chatId: string; text: string }> = [];

  return {
    deps: {
      config: {
        expirationDays: 90,
        maxPendingPerUser: 10
      },
      repository,
      telegram: {
        sendMessage: async (chatId: string, text: string) => {
          sentMessages.push({ chatId, text });
        }
      },
      vies: {
        checkVatNumber: async () => viesResult
      }
    },
    repository,
    sentMessages
  };
}

describe('handleTelegramUpdate', () => {
  test('handles /check by validating the VAT number and replying to the chat', async () => {
    const { deps, repository, sentMessages } = createDeps({ valid: false });

    await handleTelegramUpdate(
      {
        update_id: 10,
        message: {
          chat: { id: 123 },
          text: '/check PL1234567890'
        }
      },
      deps
    );

    expect(repository.requests).toEqual([
      {
        telegramChatId: '123',
        countryCode: 'PL',
        vatNumber: '1234567890',
        expirationDate: new Date('2026-09-19T00:00:00.000Z')
      }
    ]);
    expect(sentMessages).toEqual([
      {
        chatId: '123',
        text: "🕓 VAT number 'PL1234567890' is not registered in VIES yet. We will monitor it for 90 days and notify you if it becomes valid (or if the monitoring period expires)."
      }
    ]);
  });

  test('handles /list by replying with monitored VAT numbers for the chat', async () => {
    const { deps, repository, sentMessages } = createDeps();
    repository.requests.push({
      telegramChatId: '123',
      countryCode: 'PL',
      vatNumber: '1234567890',
      expirationDate: new Date('2026-09-19T00:00:00.000Z')
    });

    await handleTelegramUpdate(
      {
        update_id: 11,
        message: {
          chat: { id: 123 },
          text: '/list'
        }
      },
      deps
    );

    expect(sentMessages).toEqual([
      {
        chatId: '123',
        text: "You monitor the following VAT numbers:\n\n'PL1234567890'."
      }
    ]);
  });

  test('replies with the legacy usage message when /check has the wrong number of arguments', async () => {
    const { deps, sentMessages } = createDeps();

    await handleTelegramUpdate(
      {
        update_id: 12,
        message: {
          chat: { id: 123 },
          text: '/check'
        }
      },
      deps
    );

    expect(sentMessages).toEqual([
      {
        chatId: '123',
        text: 'Please provide a single VAT number prefixed by country code: /check VAT_NUMBER (example: /check PL1234567890).'
      }
    ]);
  });

  test('ignores updates without message text', async () => {
    const { deps, sentMessages } = createDeps();

    await handleTelegramUpdate({ update_id: 13 }, deps);

    expect(sentMessages).toEqual([]);
  });
});
