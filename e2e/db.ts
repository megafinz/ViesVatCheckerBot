import { MongoMemoryServer } from 'mongodb-memory-server';
import * as db from '../lib/db';

let mongoDb: MongoMemoryServer;

export async function init() {
  if (!mongoDb) {
    mongoDb = await MongoMemoryServer.create();
    await db.init(mongoDb.getUri());
    console.log('In-memory MongoDB initialized');
  }
}
