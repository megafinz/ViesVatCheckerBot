import type { PendingVatRequest, VatRequestErrorImport } from './types';

type MongoDocument = Record<string, unknown>;

export function mapMongoVatRequest(document: MongoDocument): PendingVatRequest {
  return {
    telegramChatId: readRequiredString(document, 'telegramChatId'),
    countryCode: readRequiredString(document, 'countryCode'),
    vatNumber: readRequiredString(document, 'vatNumber'),
    expirationDate: readRequiredDate(document, 'expirationDate')
  };
}

export function mapMongoVatRequestError(
  document: MongoDocument
): VatRequestErrorImport {
  return {
    sourceId: readSourceId(document),
    vatRequest: mapMongoVatRequest(document),
    error: readRequiredString(document, 'error')
  };
}

export function readRequiredString(
  document: MongoDocument,
  field: string
): string {
  const value = document[field];

  if (typeof value !== 'string' || value.length === 0) {
    throw invalidField(field);
  }

  return value;
}

function readRequiredDate(document: MongoDocument, field: string): Date {
  const value = document[field];

  if (!(value instanceof Date)) {
    throw invalidField(field);
  }

  return value;
}

function readSourceId(document: MongoDocument): string {
  const value = document._id;

  if (
    value &&
    typeof value === 'object' &&
    'toString' in value &&
    typeof value.toString === 'function'
  ) {
    return value.toString();
  }

  throw invalidField('_id');
}

function invalidField(field: string) {
  return new Error(`Invalid Mongo document: missing or invalid '${field}'`);
}
