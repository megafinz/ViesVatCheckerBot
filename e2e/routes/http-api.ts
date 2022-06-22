import { Request, RequestHandler, Router } from 'express';
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
  res.status(result.status).send(result.body);
});

router.post('/uncheck', validateTelegramChatId, validateVatNumber, async (req, res) => {
  const result = await httpApi.uncheck(getVatRequest(req));
  res.status(result.status).send(result.body);
});

router.post('/list', async (req, res) => {
  const telegramChatId = req.query.telegramChatId || req.body?.telegramChatId;
  const result = await httpApi.list(telegramChatId);
  res.status(result.status).send(result.body);
});

router.post('/uncheckAll', async (req, res) => {
  const telegramChatId = req.query.telegramChatId || req.body?.telegramChatId;
  const result = await httpApi.uncheckAll(telegramChatId);
  res.status(result.status).send(result.body);
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

export default router;
