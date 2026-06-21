import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/schema.ts',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://viesvatchecker:viesvatchecker@localhost:54329/viesvatchecker'
  }
});
