import { describe, expect, test } from 'bun:test';
import { createMongoMigrationSource } from './mongo-source';

describe('createMongoMigrationSource', () => {
  test('reads and maps pending VAT requests from the VatRequests collection', async () => {
    const expirationDate = new Date('2026-09-19T00:00:00.000Z');
    const source = createMongoMigrationSource(
      createDb({
        VatRequests: [
          {
            telegramChatId: '123',
            countryCode: 'PL',
            vatNumber: '1234567890',
            expirationDate
          }
        ]
      })
    );

    expect(await source.getPendingVatRequests()).toEqual([
      {
        telegramChatId: '123',
        countryCode: 'PL',
        vatNumber: '1234567890',
        expirationDate
      }
    ]);
  });

  test('reads and maps VAT request errors from the VatRequestErrors collection', async () => {
    const expirationDate = new Date('2026-09-19T00:00:00.000Z');
    const source = createMongoMigrationSource(
      createDb({
        VatRequestErrors: [
          {
            _id: { toString: () => 'error-1' },
            telegramChatId: '456',
            countryCode: 'DE',
            vatNumber: '999',
            expirationDate,
            error: 'boom'
          }
        ]
      })
    );

    expect(await source.getVatRequestErrors()).toEqual([
      {
        sourceId: 'error-1',
        vatRequest: {
          telegramChatId: '456',
          countryCode: 'DE',
          vatNumber: '999',
          expirationDate
        },
        error: 'boom'
      }
    ]);
  });
});

function createDb(collections: Record<string, Record<string, unknown>[]>) {
  return {
    collection(name: string) {
      return {
        find() {
          return {
            toArray: async () => collections[name] ?? []
          };
        }
      };
    }
  };
}
