import type { VatRequestErrorRow, VatRequestRow } from './schema';
import type { PendingVatRequest, VatRequestError } from './types';

export function toPendingVatRequest(row: VatRequestRow): PendingVatRequest {
  return {
    telegramChatId: row.telegramChatId,
    countryCode: row.countryCode,
    vatNumber: row.vatNumber,
    expirationDate: row.expirationDate
  };
}

export function toVatRequestError(row: VatRequestErrorRow): VatRequestError {
  return {
    id: row.id,
    vatRequest: {
      telegramChatId: row.telegramChatId,
      countryCode: row.countryCode,
      vatNumber: row.vatNumber,
      expirationDate: row.expirationDate
    },
    error: row.error
  };
}
