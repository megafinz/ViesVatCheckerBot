import { Schema, model, connect, isValidObjectId } from "mongoose";
import { PendingVatRequest, VatRequest, VatRequestError } from "../models";
import { DbError } from "./errors";

export type ResolveErrorResult =
    | { type: "error-not-found" }
    | { type: "error-resolved", vatRequest: VatRequest }
    | { type: "all-errors-resolved", vatRequest: VatRequest }
    | { type: "all-errors-resolved-and-vat-request-monitoring-is-resumed", vatRequest: VatRequest };

const { MONGODB_CONNECTION_STRING, VAT_NUMBER_EXPIRATION_DAYS } = process.env;
const vatNumberExpirationDays = parseInt(VAT_NUMBER_EXPIRATION_DAYS) || 90;

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

const VatRequestModel = model("VatRequest", VatRequestSchema, "VatRequests");
const VatRequestErrorModel = model("VatRequestError", VatRequestErrorSchema, "VatRequestErrors");

let db: typeof import("mongoose") = null;

export const init = async (connectionString: string = MONGODB_CONNECTION_STRING) => {
    if (!db) {
        await dbCall(async () => {
            db = await connect(connectionString);
        });
    }
}

export const addVatRequest = async (doc: VatRequest, expirationDate?: Date): Promise<PendingVatRequest> => {
    return await dbCall(async () => {
        if (!expirationDate) {
            expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + vatNumberExpirationDays);
        }
        const modelToInsert = new VatRequestModel({
            ...doc,
            expirationDate: expirationDate
        });
        const result = await modelToInsert.save();
        return modelToVatRequest(result);
    });
}

export const tryAddUniqueVatRequest = async (doc: VatRequest, expirationDate?: Date): Promise<VatRequest | false> => {
    const existingVatRequest = await findVatRequest(doc);
    if (existingVatRequest) {
        return false;
    }
    return await addVatRequest(doc, expirationDate);
}

export const findVatRequest = async (doc: VatRequest): Promise<PendingVatRequest> => {
    return await dbCall(async () => {
        const result = await VatRequestModel.findOne({
            telegramChatId: doc.telegramChatId,
            countryCode: doc.countryCode,
            vatNumber: doc.vatNumber
        });
        return modelToVatRequest(result);
    });
}

export const removeVatRequest = async (doc: VatRequest): Promise<boolean> => {
    return await dbCall(async () => {
        const result = await VatRequestModel.deleteOne({
            telegramChatId: doc.telegramChatId,
            countryCode: doc.countryCode,
            vatNumber: doc.vatNumber
        });
        return result.acknowledged;
    });
}

export const getAllVatRequests = async (telegramChatId?: string): Promise<PendingVatRequest[]> => {
    return await dbCall(async () => {
        const result = await VatRequestModel.find(telegramChatId
            ? { telegramChatId: telegramChatId }
            : {}
        );
        return result.map(m => modelToVatRequest(m));
    });
}

export const countVatRequests = async (telegramChatId: string): Promise<number> => {
    return await dbCall(async () => {
        return await VatRequestModel.countDocuments({ telegramChatId: telegramChatId });
    });
}

export const removeAllVatRequests = async (telegramChatId: string): Promise<boolean> => {
    return await dbCall(async () => {
        const result = await VatRequestModel.deleteMany({ telegramChatId: telegramChatId });
        return result.acknowledged;
    });
}

export const addVatRequestError = async (doc: PendingVatRequest, errorMessage: string): Promise<VatRequestError> => {
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

export const findVatRequestError = async (vatRequestErrorId: string): Promise<VatRequestError> => {
    if (!isValidObjectId(vatRequestErrorId)) {
        return null;
    }
    return await dbCall(async () => {
        const result = await VatRequestErrorModel.findById(vatRequestErrorId);
        return modelToVatRequestError(result);
    });
}

export const countVatRequestErrors = async (vatRequest: VatRequest): Promise<number> => {
    return await dbCall(async () => {
        return await VatRequestErrorModel.countDocuments({
            telegramChatId: vatRequest.telegramChatId,
            countryCode: vatRequest.countryCode,
            vatNumber: vatRequest.vatNumber
        });
    });
}

export const removeVatRequestError = async (vatRequestErrorId: string): Promise<boolean> => {
    if (!isValidObjectId(vatRequestErrorId)) {
        return false;
    }
    return await dbCall(async () => {
        const result = await VatRequestErrorModel.findByIdAndDelete(vatRequestErrorId);
        return !!result;
    });
};

export const resolveVatRequestError = async (vatRequestErrorId: string): Promise<ResolveErrorResult> => {
    return await dbCall(async () => {
        return await withTransaction(async () => {
            const vatRequestError = await findVatRequestError(vatRequestErrorId);
            if (!vatRequestError) {
                return { type: "error-not-found" };
            }
            const removed = await removeVatRequestError(vatRequestErrorId);
            const numberOfRemainingErrors = await countVatRequestErrors(vatRequestError.vatRequest);
            if (removed && numberOfRemainingErrors === 0) {
                return await tryAddUniqueVatRequest(vatRequestError.vatRequest, vatRequestError.vatRequest.expirationDate)
                    ? { type: "all-errors-resolved-and-vat-request-monitoring-is-resumed", vatRequest: vatRequestError.vatRequest }
                    : { type: "all-errors-resolved", vatRequest: vatRequestError.vatRequest };
            }
            return removed
                ? { type: "error-resolved", vatRequest: vatRequestError.vatRequest }
                : { type: "error-not-found", vatRequest: vatRequestError.vatRequest };
        });
    });
}

export const demoteVatRequestToError = async (vatRequest: PendingVatRequest, errorMessage: string): Promise<VatRequestError> => {
    return await dbCall(async () => {
        return await withTransaction(async () => {
            await removeVatRequest(vatRequest);
            return await addVatRequestError(vatRequest, errorMessage);
        });
    });
}

export const getAllVatRequestErrors = async (): Promise<VatRequestError[]> => {
    return await dbCall(async () => {
        const result = await VatRequestErrorModel.find({})
        return result.map(m => modelToVatRequestError(m));
    });
}

const dbCall = async <TOutput>(fn: () => Promise<TOutput>) => {
    // TODO: Polly?
    try {
        return await fn();
    } catch (error) {
        throw new DbError(error.message || JSON.stringify(error));
    }
}

const withTransaction = async <TOutput>(fn: () => Promise<TOutput>) => {
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

const modelToVatRequest = (m: any): PendingVatRequest => {
    if (!m) {
        return null;
    }
    return {
        telegramChatId: m.telegramChatId,
        countryCode: m.countryCode,
        vatNumber: m.vatNumber,
        expirationDate: m.expirationDate
    }
}

const modelToVatRequestError = (m: any): VatRequestError => {
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
    }
}
