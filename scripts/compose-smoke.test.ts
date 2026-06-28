import { expect, test } from 'bun:test';
import {
  buildComposeSmokeEnvironment,
  buildComposeSmokePlan
} from './compose-smoke';

test('compose smoke environment uses isolated ports, project, and required secrets', () => {
  const env = buildComposeSmokeEnvironment('vies-smoke-test');

  expect(env.COMPOSE_PROJECT_NAME).toBe('vies-smoke-test');
  expect(env.DATABASE_PUBLISHED_PORT).toBe('0');
  expect(env.HTTP_PUBLISHED_PORT).toBe('0');
  expect(env.ADMIN_WEB_PUBLISHED_PORT).toBe('0');
  expect(env.TG_POLLING_ENABLED).toBe('false');
  expect(env.TG_ADMIN_CHAT_ID).toBeTruthy();
  expect(env.INTERNAL_API_TOKEN).toBeTruthy();
  expect(env.DATABASE_SUPERUSER_PASSWORD).toBeTruthy();
  expect(env.DATABASE_MIGRATOR_PASSWORD).toBeTruthy();
  expect(env.DATABASE_RUNTIME_PASSWORD).toBeTruthy();
});

test('compose smoke plan migrates before starting runtime services', () => {
  const plan = buildComposeSmokePlan('vies-smoke-test');

  expect(plan.map((step) => step.name)).toEqual([
    'build images',
    'start database',
    'run migrations',
    'start runtime services',
    'read backend port',
    'read admin web port'
  ]);
  expect(plan[2].args).toContain('db-migrator');
  expect(plan[3].args).toContain('backend');
  expect(plan[3].args).toContain('admin-web');
});
