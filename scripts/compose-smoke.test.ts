import { expect, test } from 'bun:test';
import {
  buildComposeSmokeEnvironment,
  buildComposeSmokePlan
} from './compose-smoke';

test('compose smoke environment uses isolated project and required secrets', () => {
  const env = buildComposeSmokeEnvironment('vies-smoke-test');

  expect(env.COMPOSE_PROJECT_NAME).toBe('vies-smoke-test');
  expect(env.TG_POLLING_ENABLED).toBe('false');
  expect(env.ADMIN_NOTIFICATION_CHANNELS).toBe('');
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
    'read admin web port'
  ]);
  expect(plan[2].args).toContain('db-migrator');
  expect(plan[3].args).toContain('backend');
  expect(plan[3].args).toContain('admin-web');
  expect(plan[0].args).toContain('docker-compose.yml');
  expect(plan[0].args).toContain('docker-compose.dev.yml');
  expect(plan[plan.length - 1].args).toContain('port');
  expect(plan[plan.length - 1].args).toContain('admin-web');
  expect(plan[plan.length - 1].args).toContain('3000');
});
