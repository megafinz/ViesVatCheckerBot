import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

export interface PostgresClientOptions {
  maxConnections?: number;
  url: string;
}

export function createPostgresClient(options: PostgresClientOptions) {
  const sql = postgres(options.url, {
    max: options.maxConnections ?? 10
  });
  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    close: () => sql.end()
  };
}
