import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as db from './db';
import * as vies from './vies';
import * as tg from './tg';
import httpAdminApi from './routes/http-admin-api';
import httpApi from './routes/http-api';
import e2eApi from './routes/e2e-api';

const { PORT } = process.env;
const app = express();

const logger: express.RequestHandler = (req, res, next) => {
  next();
  console.log(`[${res.statusCode}] ${req.method} ${req.path}`);
};

app.use(bodyParser.json());
app.use(logger);
app.use('/api/HttpAdminApi', httpAdminApi);
app.use('/api/HttpApi', httpApi);
app.use('/e2e', e2eApi);

(async () => {
  await db.init();
  await vies.init();
  tg.init();
  app.listen(PORT || 7071, () => {
    console.log(`Server started at port ${PORT || 7071}`);
  });
})();
