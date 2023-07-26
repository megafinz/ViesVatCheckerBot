import type { VatRequest } from '@/models';
import * as vies from '@/lib/vies';
import * as db from '@/lib/db';
import { ViesError } from '@/lib/errors';
import type { HttpResponse } from '@/lib/http';

const { MAX_PENDING_VAT_NUMBERS_PER_USER, VAT_NUMBER_EXPIRATION_DAYS } =
  process.env;
const maxPendingVatNumbersPerUser =
  parseInt(MAX_PENDING_VAT_NUMBERS_PER_USER) || 10;
const vatNumberExpirationDays = parseInt(VAT_NUMBER_EXPIRATION_DAYS) || 90;

export type HttpApiHandlerBody =
  | { type: 'success'; message: string }
  | { type: 'error'; message: string; error?: any };

export type HttpApiHandlerResponse = HttpResponse<HttpApiHandlerBody>;

export async function check(
  vatRequest: VatRequest
): Promise<HttpApiHandlerResponse> {
  return await handlerCall(async () => {
    try {
      await vies.init();
      await db.init();

      const result = await vies.checkVatNumber(vatRequest);

      if (result.valid) {
        await db.removeVatRequest(vatRequest);
        return ok(
          `🟢 VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is valid.`
        );
      } else {
        const currentPendingVatNumbers = await db.countVatRequests(
          vatRequest.telegramChatId
        );

        if (currentPendingVatNumbers < maxPendingVatNumbersPerUser) {
          await db.tryAddUniqueVatRequest(vatRequest);
        } else {
          return error(
            400,
            `🔴 Sorry, you reached the limit of maximum VAT numbers you can monitor (${maxPendingVatNumbersPerUser}).`
          );
        }

        return ok(
          `🕓 VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is not registered in VIES yet. We will monitor it for ${vatNumberExpirationDays} days and notify you if it becomes valid (or if the monitoring period expires).`
        );
      }
    } catch (e) {
      if (e instanceof ViesError && e.type === 'INVALID_INPUT') {
        return error(
          400,
          `🔴 There was a problem validating your VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}'. Make sure it is in the correct format.`,
          e
        );
      } else if (
        e instanceof ViesError &&
        (e.type === 'SERVICE_UNAVAILABLE' || e.type === 'MS_UNAVAILABLE')
      ) {
        await db.tryAddUniqueVatRequest(vatRequest);
        return error(
          500,
          `🟡 There was a problem validating your VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' (looks like VIES validation service is not available right now). We'll keep monitoring it for a while.`,
          e
        );
      } else if (e instanceof ViesError && e.isRecoverable) {
        await db.tryAddUniqueVatRequest(vatRequest);
        return error(
          500,
          `🟡 There was a problem validating your VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}'. We'll keep monitoring it for a while.`,
          e
        );
      } else if (e instanceof ViesError && !e.isRecoverable) {
        return error(
          500,
          `🔴 There was a problem validating your VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}'. Looks like VIES validation service is not working as expected. Please try again later.`,
          e
        );
      }

      throw e;
    }
  });
}

export async function uncheck(
  vatRequest: VatRequest
): Promise<HttpApiHandlerResponse> {
  return await handlerCall(async () => {
    await db.init();
    await db.removeVatRequest(vatRequest);
    return ok(
      `VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is no longer being monitored.`
    );
  });
}

export async function list(
  telegramChatId: string
): Promise<HttpApiHandlerResponse> {
  return await handlerCall(async () => {
    await db.init();

    const result = await db.getAllVatRequests(telegramChatId);

    if (result.length > 0) {
      return ok(
        `You monitor the following VAT numbers:\n\n${result
          .map((vr) => `'${vr.countryCode}${vr.vatNumber}'`)
          .join(', ')}.`
      );
    } else {
      return ok('You are not monitoring any VAT numbers.');
    }
  });
}

export async function uncheckAll(
  telegramChatId: string
): Promise<HttpApiHandlerResponse> {
  return await handlerCall(async () => {
    await db.init();
    await db.removeAllVatRequests(telegramChatId);
    return ok('You no longer monitor any VAT numbers.');
  });
}

export function ok(message: string): HttpApiHandlerResponse {
  return {
    status: 200,
    body: {
      type: 'success',
      message
    }
  };
}

export function error(
  status: number,
  message: string,
  error?: any
): HttpApiHandlerResponse {
  return {
    status,
    body: {
      type: 'error',
      message,
      error
    }
  };
}

async function handlerCall(
  fn: () => Promise<HttpApiHandlerResponse>
): Promise<HttpApiHandlerResponse> {
  try {
    return await fn();
  } catch (e) {
    return error(
      500,
      "🔴 We're having some technical difficulties processing your request, please try again later.",
      e
    );
  }
}
