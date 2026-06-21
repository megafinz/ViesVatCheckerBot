import { expect, test } from 'bun:test';
import { toViesError, ViesError } from './index';

test('toViesError preserves normal error messages', () => {
  const error = toViesError(new Error('SERVICE_UNAVAILABLE'));

  expect(error).toBeInstanceOf(ViesError);
  expect(error.message).toBe('SERVICE_UNAVAILABLE');
  expect(error.type).toBe('SERVICE_UNAVAILABLE');
});

test('toViesError extracts SOAP fault payloads', () => {
  const error = toViesError({
    fault: {
      faultstring: 'MS_UNAVAILABLE'
    }
  });

  expect(error.type).toBe('MS_UNAVAILABLE');
});

test('toViesError classifies invalid WSDL responses as service unavailable', () => {
  const error = toViesError(
    new Error('Unexpected root element of WSDL or include')
  );

  expect(error.type).toBe('SERVICE_UNAVAILABLE');
  expect(error.isRecoverable).toBe(true);
});
