import { and, eq } from 'drizzle-orm';
import type { Database } from '../client';
import { toPendingVatRequest, toVatRequestError } from '../mappers';
import { vatRequestErrors, vatRequests } from '../schema';
import type { PendingVatRequest, VatRequest, VatRequestUpdate } from '../types';

export function createVatRequestRepository(db: Database) {
  return {
    async addVatRequest(
      vatRequest: VatRequest,
      expirationDate: Date
    ): Promise<PendingVatRequest> {
      const [row] = await db
        .insert(vatRequests)
        .values({ ...vatRequest, expirationDate })
        .returning();
      return toPendingVatRequest(row);
    },

    async tryAddUniqueVatRequest(
      vatRequest: VatRequest,
      expirationDate: Date
    ): Promise<PendingVatRequest | false> {
      const [row] = await db
        .insert(vatRequests)
        .values({ ...vatRequest, expirationDate })
        .onConflictDoNothing({
          target: [
            vatRequests.telegramChatId,
            vatRequests.countryCode,
            vatRequests.vatNumber
          ]
        })
        .returning();

      return row ? toPendingVatRequest(row) : false;
    },

    async findVatRequest(
      vatRequest: VatRequest
    ): Promise<PendingVatRequest | null> {
      const [row] = await db
        .select()
        .from(vatRequests)
        .where(matchesVatRequest(vatRequest));

      return row ? toPendingVatRequest(row) : null;
    },

    async removeVatRequest(vatRequest: VatRequest): Promise<boolean> {
      const rows = await db
        .delete(vatRequests)
        .where(matchesVatRequest(vatRequest))
        .returning({ id: vatRequests.id });
      return rows.length > 0;
    },

    async getAllVatRequests(
      telegramChatId?: string
    ): Promise<PendingVatRequest[]> {
      const rows = await db
        .select()
        .from(vatRequests)
        .where(
          telegramChatId
            ? eq(vatRequests.telegramChatId, telegramChatId)
            : undefined
        )
        .orderBy(vatRequests.telegramChatId, vatRequests.countryCode);

      return rows.map(toPendingVatRequest);
    },

    async countVatRequests(telegramChatId: string): Promise<number> {
      const rows = await db
        .select({ id: vatRequests.id })
        .from(vatRequests)
        .where(eq(vatRequests.telegramChatId, telegramChatId));
      return rows.length;
    },

    async removeAllVatRequests(telegramChatId: string): Promise<boolean> {
      await db
        .delete(vatRequests)
        .where(eq(vatRequests.telegramChatId, telegramChatId));
      return true;
    },

    async demoteVatRequestToError(
      vatRequest: PendingVatRequest,
      errorMessage: string
    ) {
      return await db.transaction(async (tx) => {
        const removedRows = await tx
          .delete(vatRequests)
          .where(matchesVatRequest(vatRequest))
          .returning();

        if (removedRows.length === 0) {
          return null;
        }

        const [errorRow] = await tx
          .insert(vatRequestErrors)
          .values({
            telegramChatId: vatRequest.telegramChatId,
            countryCode: vatRequest.countryCode,
            vatNumber: vatRequest.vatNumber,
            expirationDate: vatRequest.expirationDate,
            error: errorMessage
          })
          .returning();

        return toVatRequestError(errorRow);
      });
    },

    async updateVatRequest(
      vatRequest: VatRequest,
      update: VatRequestUpdate
    ): Promise<boolean> {
      const rows = await db
        .update(vatRequests)
        .set(update)
        .where(matchesVatRequest(vatRequest))
        .returning({ id: vatRequests.id });
      return rows.length > 0;
    }
  };
}

export function matchesVatRequest(vatRequest: VatRequest) {
  return and(
    eq(vatRequests.telegramChatId, vatRequest.telegramChatId),
    eq(vatRequests.countryCode, vatRequest.countryCode),
    eq(vatRequests.vatNumber, vatRequest.vatNumber)
  );
}
