import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import * as db from './db';
import httpAdminApi from './routes/http-admin-api';
import httpApi from './routes/http-api';

dotenv.config();

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

(async () => {
  await db.init();
  app.listen(PORT || 7071, () => {
    console.log(`Server started at port ${PORT}`);
  });
})();
