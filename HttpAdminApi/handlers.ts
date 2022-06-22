import { Context, HttpRequest } from '@azure/functions';
import * as db from '../lib/db';
import { sendTgMessage } from '../lib/utils';

export async function list(context: Context) {
  context.res = {
    body: await db.getAllVatRequests()
  };
}

export async function listErrors(context: Context) {
  context.res = {
    body: await db.getAllVatRequestErrors()
  };
}

export async function resolveError(context: Context, req: HttpRequest) {
  const errorId = req.query.errorId || req.body?.errorId;
  const silent = req.query.silent || req.body?.silent || false;

  if (!errorId) {
    context.res = {
      status: 400,
      body: 'Missing VAT Request Error ID'
    };
    return;
  }

  const result = await resolve(context, errorId, silent);

  switch (result.type) {
    case 'error-not-found':
      context.res = {
        status: 404,
        body: `VAT Request Error with id '${errorId}' not found`
      };
      return;

    case 'error-resolved':
      context.res = {
        status: 204,
        body: `VAT Request Error with id '${errorId}' has been resolved`
      };
      return;

    case 'all-errors-resolved':
      context.res = {
        status: 204,
        body: `All VAT Request Errors for VAT Request '${result.vatRequest.countryCode}${result.vatRequest.vatNumber}' have been resolved`
      };
      return;

    case 'all-errors-resolved-and-vat-request-monitoring-is-resumed':
      context.res = {
        status: 204,
        body: `All VAT Request Errors for Vat Request '${result.vatRequest.countryCode}${result.vatRequest.vatNumber}' have been resolved and VAT Request monitoring has resumed`
      };
      return;

    default:
      const message = 'Unexpected resolveError result';
      context.log(message, JSON.stringify(result));
      context.res = {
        status: 500,
        body: message
      };
      return;
  }
}

export async function resolveAllErrors(context: Context, req: HttpRequest) {
  const silent = req.query.silent || req.body?.silent || false;
  const vatRequestErrors = await db.getAllVatRequestErrors();

  for (const vatRequestError of vatRequestErrors) {
    await resolve(context, vatRequestError.id, silent);
  }

  context.res = {
    status: 204,
    body: 'All faulted VAT Numbers have been re-registered for monitoring.'
  };
}

async function resolve(context: Context, vatRequestErrorId: string, silent: boolean) {
  context.log(`Resolving error with id '${vatRequestErrorId}'.`);

  const result = await db.resolveVatRequestError(vatRequestErrorId);

  if (!silent && result.type === 'all-errors-resolved-and-vat-request-monitoring-is-resumed') {
    const vatNumber = `${result.vatRequest.countryCode}${result.vatRequest.vatNumber}`;
    await sendTgMessage(result.vatRequest.telegramChatId, `We resumed monitoring your VAT number '${vatNumber}'.`);
    context.log(`VAT Request Error with id '${vatRequestErrorId}' has been succesffully resolved.`);
    context.log(`User with Telegram Chat ID '${result.vatRequest.telegramChatId}' has been notified.`);
  } else if (result.type !== 'error-not-found') {
    context.log(`VAT Request Error with id '${vatRequestErrorId}' has been succesffully resolved.`);
  }

  return result;
}
