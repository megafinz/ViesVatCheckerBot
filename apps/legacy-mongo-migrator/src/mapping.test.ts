import { describe, expect, test } from 'bun:test';
import {
  mapMongoVatRequest,
  mapMongoVatRequestError,
  readRequiredString
} from './mapping';

describe('Mongo document mapping', () => {
  test('maps a VatRequests document to a pending VAT request', () => {
    const expirationDate = new Date('2026-09-19T00:00:00.000Z');

    expect(
      mapMongoVatRequest({
        _id: { toString: () => 'mongo-id-1' },
        telegramChatId: '123',
        countryCode: 'PL',
        vatNumber: '1234567890',
        expirationDate
      })
    ).toEqual({
      telegramChatId: '123',
      countryCode: 'PL',
      vatNumber: '1234567890',
      expirationDate
    });
  });

  test('maps a VatRequestErrors document to a VAT request error import row', () => {
    const expirationDate = new Date('2026-09-19T00:00:00.000Z');

    expect(
      mapMongoVatRequestError({
        _id: { toString: () => 'mongo-error-1' },
        telegramChatId: '456',
        countryCode: 'DE',
        vatNumber: '999',
        expirationDate,
        error: 'boom'
      })
    ).toEqual({
      sourceId: 'mongo-error-1',
      vatRequest: {
        telegramChatId: '456',
        countryCode: 'DE',
        vatNumber: '999',
        expirationDate
      },
      error: 'boom'
    });
  });

  test('rejects malformed Mongo documents with the missing field name', () => {
    expect(() =>
      readRequiredString({ countryCode: 'PL' }, 'telegramChatId')
    ).toThrow("Invalid Mongo document: missing or invalid 'telegramChatId'");
  });

  test('rejects expiration dates that are not Date instances', () => {
    expect(() =>
      mapMongoVatRequest({
        telegramChatId: '123',
        countryCode: 'PL',
        vatNumber: '1234567890',
        expirationDate: '2026-09-19T00:00:00.000Z'
      })
    ).toThrow("Invalid Mongo document: missing or invalid 'expirationDate'");
  });
});
