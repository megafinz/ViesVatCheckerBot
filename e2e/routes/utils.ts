import { Request, RequestHandler } from 'express';
import { parseVatNumber } from '../../lib/utils';
import { VatRequest } from '../../models';

export const validateTelegramChatId: RequestHandler = (req, res, next) => {
  const telegramChatId = req.query.telegramChatId || req.body?.telegramChatId;
  if (!telegramChatId) {
    res.status(400).send('Missing Telegram Chat ID');
    return;
  }
  next();
};

export const validateVatNumber: RequestHandler = async (req, res, next) => {
  const vatNumerString = req.query.vatNumber || req.body?.vatNumber;
  if (!vatNumerString) {
    res.status(400).send('Missing VAT number.');
    return;
  }
  if (vatNumerString.length < 3) {
    res
      .status(400)
      .send('VAT number is in invalid format (expected at least 3 symbols).');
    return;
  }
  next();
};

export function getVatRequest(req: Request): VatRequest {
  const telegramChatId = req.query.telegramChatId || req.body?.telegramChatId;
  const vatNumerString = req.query.vatNumber || req.body?.vatNumber;
  const { countryCode, vatNumber } = parseVatNumber(vatNumerString);
  return {
    telegramChatId,
    countryCode,
    vatNumber
  };
}
