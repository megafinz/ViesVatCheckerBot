import { expect, test } from 'bun:test';
import { parseVatNumber } from './vat';

test('parses the first two VAT number characters as an uppercase country code', () => {
  expect(parseVatNumber('pl1234567890')).toEqual({
    countryCode: 'PL',
    vatNumber: '1234567890'
  });
});

test('leaves the national VAT number part unchanged', () => {
  expect(parseVatNumber('DEabc123')).toEqual({
    countryCode: 'DE',
    vatNumber: 'abc123'
  });
});
