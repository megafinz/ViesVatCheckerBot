import { Response, Router } from 'express';
import * as httpApi from '../../HttpApi/handlers';
import { getVatRequest, validateTelegramChatId, validateVatNumber } from './utils';

const router = Router();

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

function setRes(res: Response, handlerRes: httpApi.HttpApiHandlerResponse) {
  if (handlerRes.body.type === 'error' && handlerRes.body.error) {
    console.log(handlerRes.body.error);
  }
  res.status(handlerRes.status).send(handlerRes.body.message);
}

export default router;
