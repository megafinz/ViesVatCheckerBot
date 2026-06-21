import { expect, test } from 'bun:test';
import { startBackend } from './index';

test('backend skeleton exposes startup label', () => {
  expect(startBackend()).toBe('viesvatchecker backend');
});
