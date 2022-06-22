import { VatRequest } from '../models';
import * as vies from '../lib/vies';
import * as db from '../lib/db';
import { ViesError } from '../lib/errors';

const { MAX_PENDING_VAT_NUMBERS_PER_USER, VAT_NUMBER_EXPIRATION_DAYS } = process.env;
const maxPendingVatNumbersPerUser = parseInt(MAX_PENDING_VAT_NUMBERS_PER_USER) || 10;
const vatNumberExpirationDays = parseInt(VAT_NUMBER_EXPIRATION_DAYS) || 90;

export type Result =
  | { type: 'Success', message: string }
  | { type: 'ClientError', message: string, error?: any }
  | { type: 'ServerError', message: string, error: any };

export async function check(vatRequest: VatRequest): Promise<Result> {
  return await handlerCall(async () => {
    try {
      await vies.init();
      await db.init();

      const result = await vies.checkVatNumber(vatRequest);

      if (result.valid) {
        await db.removeVatRequest(vatRequest);
        return { type: 'Success', message: `🟢 VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is valid.` };
      } else {
        const currentPendingVatNumbers = await db.countVatRequests(vatRequest.telegramChatId);

        if (currentPendingVatNumbers < maxPendingVatNumbersPerUser) {
          await db.tryAddUniqueVatRequest(vatRequest);
        } else {
          return { type: 'ClientError', message: `🔴 Sorry, you reached the limit of maximum VAT numbers you can monitor (${maxPendingVatNumbersPerUser}).` };
        }

        return { type: 'Success', message: `🕓 VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is not registered in VIES yet. We will monitor it for ${vatNumberExpirationDays} days and notify you if it becomes valid (or if the monitoring period expires).` };
      }
    } catch (error) {
      if (error instanceof ViesError && error.type === 'INVALID_INPUT') {
        return { type: 'ClientError', message: `🔴 There was a problem validating your VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}'. Make sure it is in the correct format.`, error: error };
      } else if (error instanceof ViesError && (error.type === 'SERVICE_UNAVAILABLE' || error.type === 'MS_UNAVAILABLE')) {
        await db.tryAddUniqueVatRequest(vatRequest);
        return { type: 'ServerError', message: `🟡 There was a problem validating your VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' (looks like VIES validation service is not available right now). We'll keep monitoring it for a while.`, error: error };
      } else if (error instanceof ViesError && error.isRecoverable) {
        await db.tryAddUniqueVatRequest(vatRequest);
        return { type: 'ServerError', message: `🟡 There was a problem validating your VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}'. We'll keep monitoring it for a while.`, error: error };
      } else if (error instanceof ViesError && !error.isRecoverable) {
        return { type: 'ServerError', message: `🔴 There was a problem validating your VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}'. Looks like VIES validation service is not working as expected. Please try again later.`, error: error };
      }

      throw error;
    }
  });
}

export async function uncheck(vatRequest: VatRequest): Promise<Result> {
  return await handlerCall(async () => {
    await db.init();
    await db.removeVatRequest(vatRequest);
    return { type: 'Success', message: `VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is no longer being monitored.` };
  });
}

export async function list(telegramChatId: string): Promise<Result> {
  return await handlerCall(async () => {
    await db.init();

    const result = await db.getAllVatRequests(telegramChatId);

    if (result.length > 0) {
      return { type: 'Success', message: `You monitor the following VAT numbers:\n\n${result.map(vr => `'${vr.countryCode}${vr.vatNumber}'`).join(', ')}.` };
    } else {
      return { type: 'Success', message: 'You are not monitoring any VAT numbers.' };
    }
  });
}

export async function uncheckAll(telegramChatId: string): Promise<Result> {
  return await handlerCall(async () => {
    await db.init();
    await db.removeAllVatRequests(telegramChatId);
    return { type: 'Success', message: 'You no longer monitor any VAT numbers.' };
  });
}

async function handlerCall(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (error) {
    return { type: 'ServerError', message: '🔴 We\'re having some technical difficulties processing your request, please try again later.', error: error };
  }
}
