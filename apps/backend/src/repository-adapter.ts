import type {
  PendingVatRequest,
  VatRequest,
  VatRequestRepository
} from '@viesvatchecker/core';

export interface VatRequestRepositoryWithExpiration {
  tryAddUniqueVatRequest(
    request: VatRequest,
    expirationDate: Date
  ): Promise<PendingVatRequest | false>;
  removeVatRequest(request: VatRequest): Promise<boolean>;
  countVatRequests(telegramChatId: string): Promise<number>;
  getAllVatRequests(telegramChatId?: string): Promise<PendingVatRequest[]>;
  removeAllVatRequests(telegramChatId: string): Promise<boolean>;
}

export interface CoreVatRequestRepositoryOptions {
  expirationDays: number;
  now?: () => Date;
  repository: VatRequestRepositoryWithExpiration;
}

export function createCoreVatRequestRepository(
  options: CoreVatRequestRepositoryOptions
): VatRequestRepository {
  const now = options.now ?? (() => new Date());

  return {
    async tryAddUniqueVatRequest(request) {
      return await options.repository.tryAddUniqueVatRequest(
        request,
        addDays(now(), options.expirationDays)
      );
    },
    removeVatRequest: options.repository.removeVatRequest,
    countVatRequests: options.repository.countVatRequests,
    getAllVatRequests: options.repository.getAllVatRequests,
    removeAllVatRequests: options.repository.removeAllVatRequests
  };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
