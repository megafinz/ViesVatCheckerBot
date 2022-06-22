import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { parseVatNumber } from '../lib/utils';
import * as handlers from './handlers';

type Action = 'check' | 'uncheck' | 'uncheckAll' | 'list';

const allowedActions: Action[] = [
  'check',
  'uncheck',
  'uncheckAll',
  'list'
];

const httpTrigger: AzureFunction = async function(context: Context, req: HttpRequest): Promise<void> {
  const telegramChatId = req.query.telegramChatId || req.body?.telegramChatId;
  const action = <Action>req.params.action;

  let result: handlers.Result = null;

  if (!telegramChatId) {
    result = { type: 'ClientError', message: 'Missing Telegram Chat ID' };
  } else if (!allowedActions.includes(action)) {
    result = { type: 'ClientError', message: `Missing or invalid action (should be one of the following: ${allowedActions.join(', ')})` };
  } else {
    switch (action) {
      case 'check':
      case 'uncheck':
        const vatNumberString: string = req.query.vatNumber || req.body?.vatNumber;

        if (!vatNumberString) {
          result = { type: 'ClientError', message: 'Missing VAT number.' };
          break;
        } else if (vatNumberString.length < 3) {
          result = { type: 'ClientError', message: 'VAT number is in invalid format (expected at least 3 symbols).' };
          break;
        }

        const { countryCode, vatNumber } = parseVatNumber(vatNumberString);

        const vatRequest = {
          telegramChatId: telegramChatId,
          countryCode: countryCode,
          vatNumber: vatNumber
        };

        result = action === 'check' ?
          await handlers.check(vatRequest) :
          await handlers.uncheck(vatRequest);
        break;

      case 'uncheckAll':
        result = await handlers.uncheckAll(telegramChatId);
        break;

      case 'list':
        result = await handlers.list(telegramChatId);
        break;
    }
  }

  context.log(result.message);

  if ((result.type === 'ClientError' || result.type === 'ServerError') && result.error) {
    context.log(result.error);
  }

  context.res = {
    status: result.type === 'Success' ? 200 : result.type === 'ClientError' ? 400 : 500,
    body: result.message
  };
};

export default httpTrigger;
