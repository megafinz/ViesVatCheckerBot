import { Request, RequestHandler, Response, Router } from 'express';
import * as httpApi from '../../HttpApi/handlers';
import { parseVatNumber } from '../../lib/utils';
import { VatRequest } from '../../models';

const router = Router();

const validateTelegramChatId: RequestHandler = (req, res, next) => {
  const telegramChatId = req.query.telegramChatId || req.body?.telegramChatId;
  if (!telegramChatId) {
    res.status(400).send('Missing Telegram Chat ID');
    return;
  }
  next();
};

const validateVatNumber: RequestHandler = async (req, res, next) => {
  const vatNumerString = req.query.vatNumber || req.body?.vatNumber;
  if (!vatNumerString) {
    res.status(400).send('Missing VAT number.');
    return;
  }
  if (vatNumerString.length < 3) {
    res.status(400).send('VAT number is in invalid format (expected at least 3 symbols).');
    return;
  }
  next();
};

router.post('/check', validateTelegramChatId, validateVatNumber, async (req, res) => {
  const result = await httpApi.check(getVatRequest(req));
  setRes(res, result);
});

router.post('/uncheck', validateTelegramChatId, validateVatNumber, async (req, res) => {
  const result = await httpApi.uncheck(getVatRequest(req));
  setRes(res, result);
});

router.post('/list', async (req, res) => {
  const telegramChatId = req.query.telegramChatId || req.body?.telegramChatId;
  const result = await httpApi.list(telegramChatId);
  setRes(res, result);
});

router.post('/uncheckAll', async (req, res) => {
  const telegramChatId = req.query.telegramChatId || req.body?.telegramChatId;
  const result = await httpApi.uncheckAll(telegramChatId);
  setRes(res, result);
});

function getVatRequest(req: Request): VatRequest {
  const telegramChatId = req.query.telegramChatId || req.body?.telegramChatId;
  const vatNumerString = req.query.vatNumber || req.body?.vatNumber;
  const { countryCode, vatNumber } = parseVatNumber(vatNumerString);
  return {
    telegramChatId,
    countryCode,
    vatNumber
  };
}

function setRes(res: Response, handlerRes: httpApi.HttpApiHandlerResponse) {
  if (handlerRes.body.type === 'error' && handlerRes.body.error) {
    console.log(handlerRes.body.error);
  }
  res.status(handlerRes.status).send(handlerRes.body.message);
}

export default router;
