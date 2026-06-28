import { errorMessage, isRecoverableError } from './errors';
import type {
  PendingVatRequest,
  VatRequestError,
  VatValidationResult,
  ViesClient
} from './types';
import { formatVatNumber } from './vat';

export interface PendingVatRequestRepository {
  getAllVatRequests(): Promise<PendingVatRequest[]>;
  removeVatRequest(vatRequest: PendingVatRequest): Promise<boolean>;
  demoteVatRequestToError(
    vatRequest: PendingVatRequest,
    errorMessage: string
  ): Promise<VatRequestError | null>;
}

export interface TelegramNotifier {
  sendMessage(telegramChatId: string, message: string): Promise<void>;
}

export type AdminNotification = {
  type: 'pending-vat-unrecoverable-error';
  severity: 'error';
  vatNumber: string;
  errorMessage: string;
  request: PendingVatRequest;
};

export interface AdminNotifier {
  notify(notification: AdminNotification): Promise<void>;
}

export type PendingVatJobResult =
  | { type: 'processed'; processedCount: number }
  | { type: 'stopped-on-recoverable-error' }
  | { type: 'processed-with-unrecoverable-errors'; processedCount: number };

export interface PendingVatJobDependencies {
  repository: PendingVatRequestRepository;
  vies: ViesClient;
  telegram: TelegramNotifier;
  adminNotifier?: AdminNotifier;
  now?: () => Date;
}

export async function processPendingVatRequests(
  deps: PendingVatJobDependencies
): Promise<PendingVatJobResult> {
  const vatRequests = await deps.repository.getAllVatRequests();
  const now = deps.now?.() ?? new Date();
  let hasUnrecoverableErrors = false;

  for (const vatRequest of vatRequests) {
    try {
      const result = await deps.vies.checkVatNumber(vatRequest);
      const shouldStop = await processVatValidationResult(
        vatRequest,
        result,
        deps,
        now
      );

      if (shouldStop) {
        break;
      }
    } catch (originalError) {
      if (isRecoverableError(originalError)) {
        return { type: 'stopped-on-recoverable-error' };
      }

      hasUnrecoverableErrors = true;
      await demoteAndNotify(vatRequest, originalError, deps);
    }
  }

  return hasUnrecoverableErrors
    ? {
        type: 'processed-with-unrecoverable-errors',
        processedCount: vatRequests.length
      }
    : { type: 'processed', processedCount: vatRequests.length };
}

async function processVatValidationResult(
  vatRequest: PendingVatRequest,
  result: VatValidationResult,
  deps: PendingVatJobDependencies,
  now: Date
) {
  const vatNumber = formatVatNumber(vatRequest);

  if (result.valid) {
    await deps.repository.removeVatRequest(vatRequest);
    await deps.telegram.sendMessage(
      vatRequest.telegramChatId,
      `🟢 Congratulations, VAT number '${vatNumber}' is now VALID!`
    );
    return false;
  }

  if (now.getTime() > vatRequest.expirationDate.getTime()) {
    await deps.repository.removeVatRequest(vatRequest);
    await deps.telegram.sendMessage(
      vatRequest.telegramChatId,
      `🔴 Your VAT number '${vatNumber}' is no longer monitored because it's still invalid and it's been too long since you registered it. Make sure you entered the right VAT number or that the entity that this VAT number belongs to actually applied for registration in VIES.`
    );
    return true;
  }

  return false;
}

async function demoteAndNotify(
  vatRequest: PendingVatRequest,
  originalError: unknown,
  deps: PendingVatJobDependencies
) {
  const vatNumber = formatVatNumber(vatRequest);
  const message = errorMessage(originalError);

  const demotedError = await deps.repository.demoteVatRequestToError(
    vatRequest,
    message
  );

  // demoteVatRequestToError returns null when the pending request no longer
  // exists (e.g. it was already demoted by a concurrent worker run). In that
  // case there is no fresh monitoring stop to report to the user, so skip the
  // Telegram message and the admin notification.
  if (demotedError === null) {
    return;
  }

  await deps.telegram.sendMessage(
    vatRequest.telegramChatId,
    `🔴 Sorry, something went wrong and we had to stop monitoring the VAT number '${vatNumber}'. We'll investigate what happened and try to resume monitoring. We'll notify you when that happens. Sorry for the inconvenience.`
  );

  if (deps.adminNotifier) {
    try {
      await deps.adminNotifier.notify({
        type: 'pending-vat-unrecoverable-error',
        severity: 'error',
        vatNumber,
        errorMessage: message,
        request: vatRequest
      });
    } catch {
      // Admin notifications are operational diagnostics; they must not break
      // the user-facing recovery path for a failed VAT request.
    }
  }
}
