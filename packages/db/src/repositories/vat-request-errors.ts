import { and, eq } from 'drizzle-orm';
import type { Database } from '../client';
import { toVatRequestError } from '../mappers';
import { vatRequestErrors, vatRequests } from '../schema';
import type { PendingVatRequest, VatRequest, VatRequestError } from '../types';

export type ResolveVatRequestErrorResult =
  | { type: 'error-not-found' }
  | { type: 'error-resolved'; vatRequest: PendingVatRequest }
  | { type: 'all-errors-resolved'; vatRequest: PendingVatRequest }
  | {
      type: 'all-errors-resolved-and-vat-request-monitoring-is-resumed';
      vatRequest: PendingVatRequest;
    };

export function createVatRequestErrorRepository(db: Database) {
  return {
    async addVatRequestError(
      vatRequest: PendingVatRequest,
      errorMessage: string
    ): Promise<VatRequestError> {
      const [row] = await db
        .insert(vatRequestErrors)
        .values({
          telegramChatId: vatRequest.telegramChatId,
          countryCode: vatRequest.countryCode,
          vatNumber: vatRequest.vatNumber,
          expirationDate: vatRequest.expirationDate,
          error: errorMessage
        })
        .returning();
      return toVatRequestError(row);
    },

    async findVatRequestError(
      vatRequestErrorId: string
    ): Promise<VatRequestError | null> {
      const [row] = await db
        .select()
        .from(vatRequestErrors)
        .where(eq(vatRequestErrors.id, vatRequestErrorId));
      return row ? toVatRequestError(row) : null;
    },

    async countVatRequestErrors(vatRequest: VatRequest): Promise<number> {
      const rows = await db
        .select({ id: vatRequestErrors.id })
        .from(vatRequestErrors)
        .where(matchesVatRequestError(vatRequest));
      return rows.length;
    },

    async removeVatRequestError(vatRequestErrorId: string): Promise<boolean> {
      const rows = await db
        .delete(vatRequestErrors)
        .where(eq(vatRequestErrors.id, vatRequestErrorId))
        .returning({ id: vatRequestErrors.id });
      return rows.length > 0;
    },

    async resolveVatRequestError(
      vatRequestErrorId: string
    ): Promise<ResolveVatRequestErrorResult> {
      return await db.transaction(async (tx) => {
        const [errorRow] = await tx
          .select()
          .from(vatRequestErrors)
          .where(eq(vatRequestErrors.id, vatRequestErrorId));

        if (!errorRow) {
          return { type: 'error-not-found' };
        }

        const vatRequest = toVatRequestError(errorRow).vatRequest;

        await tx
          .delete(vatRequestErrors)
          .where(eq(vatRequestErrors.id, vatRequestErrorId));

        const remainingRows = await tx
          .select({ id: vatRequestErrors.id })
          .from(vatRequestErrors)
          .where(matchesVatRequestError(vatRequest));

        if (remainingRows.length > 0) {
          return { type: 'error-resolved', vatRequest };
        }

        const [resumedRow] = await tx
          .insert(vatRequests)
          .values(vatRequest)
          .onConflictDoNothing({
            target: [
              vatRequests.telegramChatId,
              vatRequests.countryCode,
              vatRequests.vatNumber
            ]
          })
          .returning({ id: vatRequests.id });

        return resumedRow
          ? {
              type: 'all-errors-resolved-and-vat-request-monitoring-is-resumed',
              vatRequest
            }
          : { type: 'all-errors-resolved', vatRequest };
      });
    },

    async getAllVatRequestErrors(): Promise<VatRequestError[]> {
      const rows = await db
        .select()
        .from(vatRequestErrors)
        .orderBy(
          vatRequestErrors.telegramChatId,
          vatRequestErrors.countryCode,
          vatRequestErrors.id
        );

      return rows.map(toVatRequestError);
    }
  };
}

function matchesVatRequestError(vatRequest: VatRequest) {
  return and(
    eq(vatRequestErrors.telegramChatId, vatRequest.telegramChatId),
    eq(vatRequestErrors.countryCode, vatRequest.countryCode),
    eq(vatRequestErrors.vatNumber, vatRequest.vatNumber)
  );
}
