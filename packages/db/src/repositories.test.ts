import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { createPostgresClient, migrateDatabase, resetDatabase } from './index';
import { createVatRequestErrorRepository } from './repositories/vat-request-errors';
import { createVatRequestRepository } from './repositories/vat-requests';

const databaseUrl = process.env.DATABASE_URL;
const databaseTest = databaseUrl ? test : test.skip;

const client = databaseUrl
  ? createPostgresClient({ url: databaseUrl, maxConnections: 1 })
  : undefined;

function getDb() {
  if (!client) {
    throw new Error('DATABASE_URL is required for database integration tests.');
  }

  return client.db;
}

const vatRequest = {
  telegramChatId: '123',
  countryCode: 'PL',
  vatNumber: '1234567890'
};

const secondVatRequest = {
  telegramChatId: '456',
  countryCode: 'DE',
  vatNumber: '999'
};

afterAll(async () => {
  await client?.close();
});

describe('Postgres repositories', () => {
  beforeEach(async () => {
    if (!client) {
      return;
    }

    await resetDatabase(client.db);
    await migrateDatabase(client.db);
  });

  databaseTest(
    'migrateDatabase creates the pending and error tables',
    async () => {
      const rows = await getDb().execute(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('vat_requests', 'vat_request_errors')
      order by table_name
    `);

      expect(rows.map((row) => row.table_name)).toEqual([
        'vat_request_errors',
        'vat_requests'
      ]);
    }
  );

  databaseTest(
    'stores pending VAT requests and prevents duplicates',
    async () => {
      const repository = createVatRequestRepository(getDb());
      const expirationDate = new Date('2026-09-19T00:00:00.000Z');

      const added = await repository.tryAddUniqueVatRequest(
        vatRequest,
        expirationDate
      );
      const duplicate = await repository.tryAddUniqueVatRequest(
        vatRequest,
        expirationDate
      );

      expect(duplicate).toBe(false);
      expect(added).toEqual({
        ...vatRequest,
        expirationDate
      });
      expect(await repository.countVatRequests('123')).toBe(1);
      expect(await repository.getAllVatRequests('123')).toEqual([added]);
    }
  );

  databaseTest('removes pending VAT requests by full request key', async () => {
    const repository = createVatRequestRepository(getDb());
    const expirationDate = new Date('2026-09-19T00:00:00.000Z');
    await repository.addVatRequest(vatRequest, expirationDate);
    await repository.addVatRequest(secondVatRequest, expirationDate);

    expect(await repository.removeVatRequest(vatRequest)).toBe(true);
    expect(await repository.getAllVatRequests()).toEqual([
      { ...secondVatRequest, expirationDate }
    ]);
    expect(await repository.removeVatRequest(vatRequest)).toBe(false);
  });

  databaseTest(
    'removes all pending VAT requests for one Telegram chat',
    async () => {
      const repository = createVatRequestRepository(getDb());
      const expirationDate = new Date('2026-09-19T00:00:00.000Z');
      await repository.addVatRequest(vatRequest, expirationDate);
      await repository.addVatRequest(
        { ...secondVatRequest, telegramChatId: '123' },
        expirationDate
      );
      await repository.addVatRequest(secondVatRequest, expirationDate);

      expect(await repository.removeAllVatRequests('123')).toBe(true);
      expect(await repository.getAllVatRequests()).toEqual([
        { ...secondVatRequest, expirationDate }
      ]);
    }
  );

  databaseTest(
    'updates pending VAT request country code and number',
    async () => {
      const repository = createVatRequestRepository(getDb());
      const expirationDate = new Date('2026-09-19T00:00:00.000Z');
      await repository.addVatRequest(vatRequest, expirationDate);

      expect(
        await repository.updateVatRequest(vatRequest, {
          countryCode: 'CZ',
          vatNumber: '987'
        })
      ).toBe(true);

      expect(await repository.getAllVatRequests('123')).toEqual([
        {
          telegramChatId: '123',
          countryCode: 'CZ',
          vatNumber: '987',
          expirationDate
        }
      ]);
    }
  );

  databaseTest(
    'demotes pending VAT requests into the error table',
    async () => {
      const requestRepository = createVatRequestRepository(getDb());
      const errorRepository = createVatRequestErrorRepository(getDb());
      const expirationDate = new Date('2026-09-19T00:00:00.000Z');
      const pendingVatRequest = await requestRepository.addVatRequest(
        vatRequest,
        expirationDate
      );

      const error = await requestRepository.demoteVatRequestToError(
        pendingVatRequest,
        'boom'
      );

      expect(error).toMatchObject({
        vatRequest: pendingVatRequest,
        error: 'boom'
      });
      expect(await requestRepository.getAllVatRequests()).toEqual([]);
      expect(await errorRepository.getAllVatRequestErrors()).toEqual([error]);
    }
  );

  databaseTest(
    'resolves the last error and resumes pending monitoring',
    async () => {
      const requestRepository = createVatRequestRepository(getDb());
      const errorRepository = createVatRequestErrorRepository(getDb());
      const expirationDate = new Date('2026-09-19T00:00:00.000Z');
      const error = await errorRepository.addVatRequestError(
        { ...vatRequest, expirationDate },
        'boom'
      );

      const result = await errorRepository.resolveVatRequestError(error.id);

      expect(result).toEqual({
        type: 'all-errors-resolved-and-vat-request-monitoring-is-resumed',
        vatRequest: { ...vatRequest, expirationDate }
      });
      expect(await errorRepository.getAllVatRequestErrors()).toEqual([]);
      expect(await requestRepository.getAllVatRequests()).toEqual([
        { ...vatRequest, expirationDate }
      ]);
    }
  );

  databaseTest(
    'resolves one of multiple errors without resuming pending monitoring',
    async () => {
      const requestRepository = createVatRequestRepository(getDb());
      const errorRepository = createVatRequestErrorRepository(getDb());
      const expirationDate = new Date('2026-09-19T00:00:00.000Z');
      const firstError = await errorRepository.addVatRequestError(
        { ...vatRequest, expirationDate },
        'boom 1'
      );
      const secondError = await errorRepository.addVatRequestError(
        { ...vatRequest, expirationDate },
        'boom 2'
      );

      const result = await errorRepository.resolveVatRequestError(
        firstError.id
      );

      expect(result).toEqual({
        type: 'error-resolved',
        vatRequest: { ...vatRequest, expirationDate }
      });
      expect(await errorRepository.getAllVatRequestErrors()).toEqual([
        secondError
      ]);
      expect(await requestRepository.getAllVatRequests()).toEqual([]);
    }
  );
});
