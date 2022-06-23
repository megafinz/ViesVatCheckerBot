import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import * as db from '../lib/db';

let mongoDb: MongoMemoryServer;

export async function init(): Promise<void> {
  if (!mongoDb) {
    mongoDb = await MongoMemoryServer.create();
    await db.init(mongoDb.getUri());
    console.log('In-memory MongoDB initialized');
  }
}

export async function clear(): Promise<void> {
  if (mongoDb) {
    const collections = mongoose.connection.collections;
    for (const collectionName of Object.keys(collections)) {
      const collection = collections[collectionName];
      await collection.deleteMany({});
    }
    console.log('In-memory MongoDB has been cleared');
  }
}
