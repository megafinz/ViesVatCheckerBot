import { Schema, connect, isValidObjectId, model } from 'mongoose';
import { cfg } from '../lib/cfg';
import type {
  PendingVatRequest,
  VatRequest,
  VatRequestError,
  VatRequestUpdate
} from '../models';
import { DbError } from './errors';
import { addDays, errorToString } from './utils';

export type ResolveErrorResult =
  | { type: 'error-not-found' }
  | { type: 'error-resolved'; vatRequest: VatRequest }
  | { type: 'all-errors-resolved'; vatRequest: VatRequest }
  | {
      type: 'all-errors-resolved-and-vat-request-monitoring-is-resumed';
      vatRequest: VatRequest;
    };

const VatRequestSchema = new Schema({
  telegramChatId: String,
  countryCode: String,
  vatNumber: String,
  expirationDate: Date
});

const VatRequestErrorSchema = new Schema({
  telegramChatId: String,
  countryCode: String,
  vatNumber: String,
  expirationDate: Date,
  error: String
});

const VatRequestModel = model('VatRequest', VatRequestSchema, 'VatRequests');
const VatRequestErrorModel = model(
  'VatRequestError',
  VatRequestErrorSchema,
  'VatRequestErrors'
);

let db: typeof import('mongoose') = null;

export async function init(connectionString: string = cfg.db.connectionString) {
  if (!db) {
    await dbCall(async () => {
      db = await connect(connectionString);
    });
  }
}

export async function tearDown() {
  if (db) {
    await dbCall(async () => {
      await db.disconnect();
    });
    db = null;
  }
}

export async function addVatRequest(
  doc: VatRequest,
  expirationDate?: Date
): Promise<PendingVatRequest> {
  return await dbCall(async () => {
    if (!expirationDate) {
      expirationDate = addDays(new Date(), cfg.vatNumbers.expirationDays);
    }
    const modelToInsert = new VatRequestModel({
      ...doc,
      expirationDate
    });
    const result = await modelToInsert.save();
    return modelToVatRequest(result);
  });
}

export async function tryAddUniqueVatRequest(
  doc: VatRequest,
  expirationDate?: Date
): Promise<VatRequest | false> {
  const existingVatRequest = await findVatRequest(doc);
  if (existingVatRequest) {
    return false;
  }
  return await addVatRequest(doc, expirationDate);
}

export async function findVatRequest(
  doc: VatRequest
): Promise<PendingVatRequest> {
  const result = await findVatRequestModel(doc);
  return modelToVatRequest(result);
}

export async function removeVatRequest(doc: VatRequest): Promise<boolean> {
  return await dbCall(async () => {
    const result = await VatRequestModel.deleteOne({
      telegramChatId: doc.telegramChatId,
      countryCode: doc.countryCode,
      vatNumber: doc.vatNumber
    });
    return result.acknowledged && result.deletedCount > 0;
  });
}

export async function getAllVatRequests(
  telegramChatId?: string
): Promise<PendingVatRequest[]> {
  return await dbCall(async () => {
    const result = await VatRequestModel.find(
      telegramChatId ? { telegramChatId: telegramChatId } : {}
    );
    return result.map((m) => modelToVatRequest(m));
  });
}

export async function countVatRequests(
  telegramChatId: string
): Promise<number> {
  return await dbCall(async () => {
    return await VatRequestModel.countDocuments({
      telegramChatId: telegramChatId
    });
  });
}

export async function removeAllVatRequests(
  telegramChatId: string
): Promise<boolean> {
  return await dbCall(async () => {
    const result = await VatRequestModel.deleteMany({
      telegramChatId: telegramChatId
    });
    return result.acknowledged;
  });
}

export async function addVatRequestError(
  doc: PendingVatRequest,
  errorMessage: string
): Promise<VatRequestError> {
  return await dbCall(async () => {
    const modelToInsert = new VatRequestErrorModel({
      telegramChatId: doc.telegramChatId,
      countryCode: doc.countryCode,
      vatNumber: doc.vatNumber,
      expirationDate: doc.expirationDate,
      error: errorMessage
    });
    const result = await modelToInsert.save();
    return modelToVatRequestError(result);
  });
}

export async function findVatRequestError(
  vatRequestErrorId: string
): Promise<VatRequestError> {
  if (!isValidObjectId(vatRequestErrorId)) {
    return null;
  }
  return await dbCall(async () => {
    const result = await VatRequestErrorModel.findById(vatRequestErrorId);
    return modelToVatRequestError(result);
  });
}

export async function countVatRequestErrors(
  vatRequest: VatRequest
): Promise<number> {
  return await dbCall(async () => {
    return await VatRequestErrorModel.countDocuments({
      telegramChatId: vatRequest.telegramChatId,
      countryCode: vatRequest.countryCode,
      vatNumber: vatRequest.vatNumber
    });
  });
}

export async function removeVatRequestError(
  vatRequestErrorId: string
): Promise<boolean> {
  if (!isValidObjectId(vatRequestErrorId)) {
    return false;
  }
  return await dbCall(async () => {
    const result = await VatRequestErrorModel.findByIdAndDelete(
      vatRequestErrorId
    );
    return !!result;
  });
}

export async function resolveVatRequestError(
  vatRequestErrorId: string
): Promise<ResolveErrorResult> {
  return await dbCall(async () => {
    return await withTransaction(async () => {
      const vatRequestError = await findVatRequestError(vatRequestErrorId);
      if (!vatRequestError) {
        return { type: 'error-not-found' };
      }
      const removed = await removeVatRequestError(vatRequestErrorId);
      const numberOfRemainingErrors = await countVatRequestErrors(
        vatRequestError.vatRequest
      );
      if (removed && numberOfRemainingErrors === 0) {
        return (await tryAddUniqueVatRequest(
          vatRequestError.vatRequest,
          vatRequestError.vatRequest.expirationDate
        ))
          ? {
              type: 'all-errors-resolved-and-vat-request-monitoring-is-resumed',
              vatRequest: vatRequestError.vatRequest
            }
          : {
              type: 'all-errors-resolved',
              vatRequest: vatRequestError.vatRequest
            };
      }
      return removed
        ? { type: 'error-resolved', vatRequest: vatRequestError.vatRequest }
        : { type: 'error-not-found', vatRequest: vatRequestError.vatRequest };
    });
  });
}

export async function demoteVatRequestToError(
  vatRequest: PendingVatRequest,
  errorMessage: string
): Promise<VatRequestError | null> {
  return await dbCall(async () => {
    return await withTransaction(async () => {
      if (await removeVatRequest(vatRequest)) {
        return await addVatRequestError(vatRequest, errorMessage);
      } else {
        return null;
      }
    });
  });
}

export async function getAllVatRequestErrors(): Promise<VatRequestError[]> {
  return await dbCall(async () => {
    const result = await VatRequestErrorModel.find({});
    return result.map((m) => modelToVatRequestError(m));
  });
}

export async function updateVatRequest(
  doc: VatRequest,
  update: VatRequestUpdate
): Promise<boolean> {
  return await dbCall(async () => {
    const vatRequest = await findVatRequestModel(doc);
    if (!vatRequest) {
      return false;
    }
    vatRequest.countryCode = update.countryCode;
    vatRequest.vatNumber = update.vatNumber;
    await vatRequest.save();
    return true;
  });
}

async function dbCall<TOutput>(fn: () => Promise<TOutput>) {
  // TODO: Polly?
  try {
    return await fn();
  } catch (error) {
    throw new DbError(errorToString(error));
  }
}

async function withTransaction<TOutput>(fn: () => Promise<TOutput>) {
  const session = await db.startSession();
  session.startTransaction();
  try {
    const result = await fn();
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}

async function findVatRequestModel(doc: VatRequest) {
  return await dbCall(async () => {
    return await VatRequestModel.findOne({
      telegramChatId: doc.telegramChatId,
      countryCode: doc.countryCode,
      vatNumber: doc.vatNumber
    });
  });
}

function modelToVatRequest(m: any): PendingVatRequest {
  if (!m) {
    return null;
  }
  return {
    telegramChatId: m.telegramChatId,
    countryCode: m.countryCode,
    vatNumber: m.vatNumber,
    expirationDate: m.expirationDate
  };
}

function modelToVatRequestError(m: any): VatRequestError {
  if (!m) {
    return null;
  }
  return {
    id: m.id,
    vatRequest: {
      telegramChatId: m.telegramChatId,
      countryCode: m.countryCode,
      vatNumber: m.vatNumber,
      expirationDate: m.expirationDate
    },
    error: m.error
  };
}
