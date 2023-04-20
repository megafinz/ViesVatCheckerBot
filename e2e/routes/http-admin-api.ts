import { Router } from 'express';
import * as httpAdminApiHandlers from '../../HttpAdminApi/handlers';

const router = Router();

router.get('/list', async (_, res) => {
  const result = await httpAdminApiHandlers.list();
  res.status(result.status).send(JSON.stringify(result.body));
});

router.get('/listErrors', async (_, res) => {
  const result = await httpAdminApiHandlers.listErrors();
  res.status(result.status).send(JSON.stringify(result.body));
});

router.post('/resolveError', async (req, res) => {
  const errorId = req.query.errorId || req.body?.errorId;
  const silent = req.query.silent || req.body?.silent;
  const result = await httpAdminApiHandlers.resolveError(
    console.log,
    errorId,
    silent
  );
  res.status(result.status).send(result.body);
});

router.post('/resolveAllErrors', async (req, res) => {
  const silent = req.query.silent || req.body?.silent;
  const result = await httpAdminApiHandlers.resolveAllErrors(
    console.log,
    silent
  );
  res.status(result.status).send();
});

export default router;
