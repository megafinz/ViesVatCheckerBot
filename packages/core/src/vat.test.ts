import { describe, expect, test } from 'bun:test';
import { InvalidVatNumberFormatError, parseVatNumber } from './vat';

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

test('trims surrounding whitespace before parsing', () => {
  expect(parseVatNumber('  PL12345  ')).toEqual({
    countryCode: 'PL',
    vatNumber: '12345'
  });
});

describe('parseVatNumber format validation', () => {
  test('rejects a missing country code', () => {
    expect(() => parseVatNumber('1234567890')).toThrow(
      InvalidVatNumberFormatError
    );
  });

  test('rejects a non-letter country code', () => {
    expect(() => parseVatNumber('P112345678')).toThrow(
      InvalidVatNumberFormatError
    );
  });

  test('rejects a missing national number', () => {
    expect(() => parseVatNumber('PL')).toThrow(InvalidVatNumberFormatError);
  });

  test('rejects illegal characters in the national number', () => {
    expect(() => parseVatNumber('PL12-34')).toThrow(
      InvalidVatNumberFormatError
    );
    expect(() => parseVatNumber('PL12 34')).toThrow(
      InvalidVatNumberFormatError
    );
  });
});
