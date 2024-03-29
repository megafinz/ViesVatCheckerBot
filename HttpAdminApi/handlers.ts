import * as db from '../lib/db';
import { HttpResponse } from '../lib/http';
import * as tg from '../lib/tg';
import { Logger, parseVatNumber } from '../lib/utils';
import { PendingVatRequest, VatRequestError } from '../models';

export async function list(): Promise<HttpResponse<PendingVatRequest[]>> {
  return {
    status: 200,
    body: await db.getAllVatRequests()
  };
}

export async function listErrors(): Promise<HttpResponse<VatRequestError[]>> {
  return {
    status: 200,
    body: await db.getAllVatRequestErrors()
  };
}

export async function resolveError(
  log: Logger,
  errorId?: string,
  silent?: boolean
): Promise<HttpResponse> {
  silent ??= false;

  if (!errorId) {
    return {
      status: 400,
      body: 'Missing VAT Request Error ID'
    };
  }

  const result = await resolve(log, errorId, silent);

  switch (result.type) {
    case 'error-not-found':
      return {
        status: 404,
        body: `VAT Request Error with id '${errorId}' not found`
      };

    case 'error-resolved':
      return {
        status: 204
      };

    case 'all-errors-resolved':
      return {
        status: 204
      };

    case 'all-errors-resolved-and-vat-request-monitoring-is-resumed':
      return {
        status: 204
      };

    default:
      const message = 'Unexpected resolveError result';
      log(message, JSON.stringify(result));
      return {
        status: 500,
        body: message
      };
  }
}

export async function resolveAllErrors(log: Logger, silent?: boolean) {
  silent ??= false;
  const vatRequestErrors = await db.getAllVatRequestErrors();

  for (const vatRequestError of vatRequestErrors) {
    await resolve(log, vatRequestError.id, silent);
  }

  return {
    status: 204
  };
}

export async function removeError(log: Logger, vatRequestErrorId?: string) {
  if (!vatRequestErrorId) {
    return {
      status: 400,
      body: 'Missing VAT Request Error ID'
    };
  }

  log(`Removing error with id '${vatRequestErrorId}'.`);

  const result = await db.removeVatRequestError(vatRequestErrorId);

  if (result) {
    log(
      `VAT Request Error with id '${vatRequestErrorId}' has been successfully removed`
    );
    return {
      status: 204
    };
  } else {
    return {
      status: 404,
      body: `VAT Request Error with id '${vatRequestErrorId}' not found`
    };
  }
}

async function resolve(
  log: Logger,
  vatRequestErrorId: string,
  silent: boolean
) {
  log(`Resolving error with id '${vatRequestErrorId}'.`);

  const result = await db.resolveVatRequestError(vatRequestErrorId);

  if (
    !silent &&
    result.type === 'all-errors-resolved-and-vat-request-monitoring-is-resumed'
  ) {
    const vatNumber = `${result.vatRequest.countryCode}${result.vatRequest.vatNumber}`;
    await tg.sendMessage(
      result.vatRequest.telegramChatId,
      `We resumed monitoring your VAT number '${vatNumber}'.`
    );
    log(
      `VAT Request Error with id '${vatRequestErrorId}' has been succesffully resolved.`
    );
    log(
      `User with Telegram Chat ID '${result.vatRequest.telegramChatId}' has been notified.`
    );
  } else if (result.type !== 'error-not-found') {
    log(
      `VAT Request Error with id '${vatRequestErrorId}' has been succesffully resolved.`
    );
  }

  return result;
}

export async function update(
  log: Logger,
  telegramChatId: string,
  vatNumber: string,
  newVatNumber: string
) {
  if (!telegramChatId) {
    return {
      status: 400,
      body: 'Missing Telegram Chat ID'
    };
  }

  if (!vatNumber) {
    return {
      status: 400,
      body: 'Missing VAT Number'
    };
  }

  if (!newVatNumber) {
    return {
      status: 400,
      body: 'Missing new VAT Number'
    };
  }

  if (vatNumber === newVatNumber) {
    return {
      status: 204
    };
  }

  // TODO: validate new VAT number

  log(`Updating VAT Request with number '${vatNumber}' to '${newVatNumber}'.`);

  const { countryCode: oldCountryCode, vatNumber: oldVatNumber } =
    parseVatNumber(vatNumber);
  const { countryCode: updatedCountryCode, vatNumber: updatedVatNumber } =
    parseVatNumber(newVatNumber);

  const vatRequest = {
    telegramChatId: telegramChatId,
    countryCode: oldCountryCode,
    vatNumber: oldVatNumber
  };

  const result = await db.updateVatRequest(vatRequest, {
    countryCode: updatedCountryCode,
    vatNumber: updatedVatNumber
  });

  if (!result) {
    return {
      status: 404,
      body: `VAT Request with number '${vatNumber}' and Telegram Chat ID '${telegramChatId}' not found.`
    };
  }

  log(
    `VAT Request with number '${vatNumber}' and Telegram Chat ID '${telegramChatId}' has been successfully updated to '${newVatNumber}'`
  );

  return {
    status: 204
  };
}
