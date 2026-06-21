import type {
  MigrationTarget,
  PendingVatRequest,
  VatRequest,
  VatRequestErrorImport
} from './types';

interface VatRequestRepository {
  getAllVatRequests(): Promise<PendingVatRequest[]>;
  tryAddUniqueVatRequest(
    vatRequest: VatRequest,
    expirationDate: Date
  ): Promise<PendingVatRequest | false>;
}

interface VatRequestErrorRepository {
  getAllVatRequestErrors(): Promise<unknown[]>;
  addVatRequestError(
    vatRequest: PendingVatRequest,
    errorMessage: string
  ): Promise<unknown>;
}

export interface PostgresMigrationTargetDependencies {
  vatRequests: VatRequestRepository;
  vatRequestErrors: VatRequestErrorRepository;
}

export function createPostgresMigrationTarget(
  deps: PostgresMigrationTargetDependencies
): MigrationTarget {
  return {
    async countPendingVatRequests() {
      return (await deps.vatRequests.getAllVatRequests()).length;
    },

    async countVatRequestErrors() {
      return (await deps.vatRequestErrors.getAllVatRequestErrors()).length;
    },

    async insertPendingVatRequest(vatRequest: PendingVatRequest) {
      return !!(await deps.vatRequests.tryAddUniqueVatRequest(
        {
          telegramChatId: vatRequest.telegramChatId,
          countryCode: vatRequest.countryCode,
          vatNumber: vatRequest.vatNumber
        },
        vatRequest.expirationDate
      ));
    },

    async insertVatRequestError(vatRequestError: VatRequestErrorImport) {
      await deps.vatRequestErrors.addVatRequestError(
        vatRequestError.vatRequest,
        vatRequestError.error
      );
    }
  };
}
