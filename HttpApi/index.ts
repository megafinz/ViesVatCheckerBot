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

  let result: handlers.HttpApiHandlerResponse;

  if (!telegramChatId) {
    result = handlers.error(400, 'Missing Telegram Chat ID');
  } else if (!allowedActions.includes(action)) {
    result = handlers.error(400, `Missing or invalid action (should be one of the following: ${allowedActions.join(', ')})`);
  } else {
    switch (action) {
      case 'check':
      case 'uncheck':
        const vatNumberString: string = req.query.vatNumber || req.body?.vatNumber;

        if (!vatNumberString) {
          result = handlers.error(400, 'Missing VAT number.');
          break;
        }

        // TODO: use regex as VIES does?
        if (vatNumberString.length < 3) {
          result = handlers.error(400, 'VAT number is in invalid format (expected at least 3 symbols).');
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

  context.log(result.body.message);

  if (result.body.type === 'error' && result.body.error) {
    context.log(result.body.error);
  }

  context.res = {
    status: result.status,
    body: result.body.message
  };
};

export default httpTrigger;
