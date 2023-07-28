import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import * as db from '../lib/db';
import {
  list,
  listErrors,
  removeError,
  resolveAllErrors,
  resolveError,
  update
} from './handlers';

type Action =
  | 'list'
  | 'listErrors'
  | 'resolveError'
  | 'resolveAllErrors'
  | 'removeError'
  | 'update';
const allowedActions: Action[] = [
  'list',
  'listErrors',
  'resolveError',
  'resolveAllErrors',
  'removeError',
  'update'
];

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const action = <Action>req.params.action;

  if (!action || !allowedActions.includes(action)) {
    context.res = {
      status: 400,
      body: `Missing or invalid action (should be one of: ${allowedActions.join(
        ', '
      )})`
    };
    return;
  }

  await db.init();

  switch (action) {
    case 'list': {
      context.res = { ...(await list()) };
      return;
    }

    case 'listErrors': {
      context.res = { ...(await listErrors()) };
      return;
    }

    case 'resolveError': {
      const errorId = req.query.errorId || req.body?.errorId;
      const silent = req.query.silent || req.body?.silent;
      context.res = { ...(await resolveError(context.log, errorId, silent)) };
      return;
    }

    case 'resolveAllErrors': {
      const silent = req.query.silent || req.body?.silent;
      context.res = { ...(await resolveAllErrors(context.log, silent)) };
      return;
    }

    case 'removeError': {
      const errorId = req.query.errorId || req.body?.errorId;
      context.res = { ...(await removeError(context.log, errorId)) };
      return;
    }

    case 'update': {
      const telegramChatId =
        req.query.telegramChatId || req.body?.telegramChatId;
      const vatNumber = req.query.vatNumber || req.body?.vatNumber;
      const newVatNumber = req.query.newVatNumber || req.body?.newVatNumber;
      context.res = {
        ...(await update(context.log, telegramChatId, vatNumber, newVatNumber))
      };
      return;
    }
  }
};

export default httpTrigger;
