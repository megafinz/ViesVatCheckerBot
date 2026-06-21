import { mapMongoVatRequest, mapMongoVatRequestError } from './mapping';
import type { MigrationSource } from './types';

interface MongoCollection {
  find(): {
    toArray(): Promise<Record<string, unknown>[]>;
  };
}

interface MongoDatabase {
  collection(name: string): MongoCollection;
}

export function createMongoMigrationSource(db: MongoDatabase): MigrationSource {
  return {
    async getPendingVatRequests() {
      const documents = await db.collection('VatRequests').find().toArray();
      return documents.map(mapMongoVatRequest);
    },

    async getVatRequestErrors() {
      const documents = await db
        .collection('VatRequestErrors')
        .find()
        .toArray();
      return documents.map(mapMongoVatRequestError);
    }
  };
}
