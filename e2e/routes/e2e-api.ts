import { Router } from 'express';
import * as db from '../../lib/db';
import * as testDb from '../db';
import { getVatRequest, validateTelegramChatId, validateVatNumber } from './utils';

const router = Router();

router.post('/reset', async (_, res) => {
  await testDb.clear();
  res.status(204).send();
});

router.post('/demote', validateTelegramChatId, validateVatNumber, async (req, res) => {
  const vatRequest = getVatRequest(req);
  const pendingVatRequest = await db.findVatRequest(vatRequest);
  if (!pendingVatRequest) {
    res.status(404).send();
    return;
  }
  const errorMessage = req.query.errorMessage || req.body?.errorMessage || 'Oops';
  const error = await db.demoteVatRequestToError(pendingVatRequest, errorMessage);
  res.status(error ? 204 : 404).send();
});

export default router;
