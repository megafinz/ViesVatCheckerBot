import { expect, test } from 'bun:test';
import { startAdminWeb } from './index';

test('admin web skeleton exposes startup label', () => {
  expect(startAdminWeb()).toBe('viesvatchecker admin web');
});
