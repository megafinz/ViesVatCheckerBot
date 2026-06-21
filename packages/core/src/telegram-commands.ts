import { ViesError } from './errors';
import { error, handlerCall, ok } from './responses';
import type {
  CoreResponse,
  PendingVatRequest,
  VatRequest,
  ViesClient
} from './types';
import { formatVatNumber } from './vat';

export interface VatRequestRepository {
  tryAddUniqueVatRequest(
    vatRequest: VatRequest
  ): Promise<PendingVatRequest | false>;
  removeVatRequest(vatRequest: VatRequest): Promise<boolean>;
  countVatRequests(telegramChatId: string): Promise<number>;
  getAllVatRequests(telegramChatId?: string): Promise<PendingVatRequest[]>;
  removeAllVatRequests(telegramChatId: string): Promise<boolean>;
}

export interface VatCommandConfig {
  expirationDays: number;
  maxPendingPerUser: number;
}

export interface CheckVatRequestDependencies {
  repository: VatRequestRepository;
  vies: ViesClient;
  config: VatCommandConfig;
}

export interface VatRequestCommandDependencies {
  repository: VatRequestRepository;
}

export async function checkVatRequest(
  vatRequest: VatRequest,
  deps: CheckVatRequestDependencies
): Promise<CoreResponse> {
  return await handlerCall(async () => {
    try {
      const result = await deps.vies.checkVatNumber(vatRequest);
      const vatNumber = formatVatNumber(vatRequest);

      if (result.valid) {
        await deps.repository.removeVatRequest(vatRequest);
        return ok(`🟢 VAT number '${vatNumber}' is valid.`);
      }

      const currentPendingVatNumbers = await deps.repository.countVatRequests(
        vatRequest.telegramChatId
      );

      if (currentPendingVatNumbers < deps.config.maxPendingPerUser) {
        await deps.repository.tryAddUniqueVatRequest(vatRequest);
      } else {
        return error(
          400,
          `🔴 Sorry, you reached the limit of maximum VAT numbers you can monitor (${deps.config.maxPendingPerUser}).`
        );
      }

      return ok(
        `🕓 VAT number '${vatNumber}' is not registered in VIES yet. We will monitor it for ${deps.config.expirationDays} days and notify you if it becomes valid (or if the monitoring period expires).`
      );
    } catch (originalError) {
      if (originalError instanceof ViesError) {
        return await handleViesError(vatRequest, deps, originalError);
      }

      throw originalError;
    }
  });
}

export async function uncheckVatRequest(
  vatRequest: VatRequest,
  deps: VatRequestCommandDependencies
): Promise<CoreResponse> {
  return await handlerCall(async () => {
    await deps.repository.removeVatRequest(vatRequest);
    return ok(
      `VAT number '${formatVatNumber(vatRequest)}' is no longer being monitored.`
    );
  });
}

export async function listVatRequests(
  telegramChatId: string,
  deps: VatRequestCommandDependencies
): Promise<CoreResponse> {
  return await handlerCall(async () => {
    const vatRequests = await deps.repository.getAllVatRequests(telegramChatId);

    if (vatRequests.length === 0) {
      return ok('You are not monitoring any VAT numbers.');
    }

    return ok(
      `You monitor the following VAT numbers:\n\n${vatRequests
        .map((vatRequest) => `'${formatVatNumber(vatRequest)}'`)
        .join(', ')}.`
    );
  });
}

export async function uncheckAllVatRequests(
  telegramChatId: string,
  deps: VatRequestCommandDependencies
): Promise<CoreResponse> {
  return await handlerCall(async () => {
    await deps.repository.removeAllVatRequests(telegramChatId);
    return ok('You no longer monitor any VAT numbers.');
  });
}

async function handleViesError(
  vatRequest: VatRequest,
  deps: CheckVatRequestDependencies,
  originalError: ViesError
): Promise<CoreResponse> {
  const vatNumber = formatVatNumber(vatRequest);

  if (originalError.type === 'INVALID_INPUT') {
    return error(
      400,
      `🔴 There was a problem validating your VAT number '${vatNumber}'. Make sure it is in the correct format.`,
      originalError
    );
  }

  if (
    originalError.type === 'SERVICE_UNAVAILABLE' ||
    originalError.type === 'MS_UNAVAILABLE'
  ) {
    await deps.repository.tryAddUniqueVatRequest(vatRequest);
    return error(
      500,
      `🟡 There was a problem validating your VAT number '${vatNumber}' (looks like VIES validation service is not available right now). We'll keep monitoring it for a while.`,
      originalError
    );
  }

  if (originalError.isRecoverable) {
    await deps.repository.tryAddUniqueVatRequest(vatRequest);
    return error(
      500,
      `🟡 There was a problem validating your VAT number '${vatNumber}'. We'll keep monitoring it for a while.`,
      originalError
    );
  }

  return error(
    500,
    `🔴 There was a problem validating your VAT number '${vatNumber}'. Looks like VIES validation service is not working as expected. Please try again later.`,
    originalError
  );
}
