import * as mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as db from '../lib/db';

let mongoServer: MongoMemoryServer;

export async function init(): Promise<void> {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await db.init(uri);
}

export async function clear(): Promise<void> {
    const collections = mongoose.connection.collections;
    for (const collectionName of Object.keys(collections)) {
        const collection = collections[collectionName];
        await collection.deleteMany({});
    }
}

export async function tearDown(): Promise<void> {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
}
