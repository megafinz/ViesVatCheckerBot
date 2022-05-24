import { Schema, model, connect } from "mongoose";
import { PendingVatRequest, VatRequest, VatRequestError } from "../models";
import { DbError } from "./errors";

const { MONGODB_CONNECTION_STRING, VAT_NUMBER_EXPIRATION_DAYS } = process.env;
const vatNumberExpirationDays = parseInt(VAT_NUMBER_EXPIRATION_DAYS);

let db: typeof import("mongoose") = null;

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
    expirationDate: String,
    error: String
});

const VatRequestModel = model("VatRequest", VatRequestSchema, "VatRequests");
const VatRequestErrorModel = model("VatRequestError", VatRequestErrorSchema, "VatRequestErrors");

export const init = async () => {
    if (!db) {
        db = await connect(MONGODB_CONNECTION_STRING);
    }
};

export const addVatRequest = async (doc: VatRequest, expirationDate?: Date): Promise<void> => {
    return await dbCall(async () => {
        if (!expirationDate) {
            expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + vatNumberExpirationDays);
        }
        const modelToInsert = new VatRequestModel({
            telegramChatId: doc.telegramChatId,
            countryCode: doc.countryCode,
            vatNumber: doc.vatNumber,
            expirationDate: expirationDate
        });
        return await modelToInsert.save();
    });
};

export const findVatRequest = async (doc: VatRequest): Promise<PendingVatRequest> => {
    return await dbCall(async () => {
        return await VatRequestModel.findOne({
            telegramChatId: doc.telegramChatId,
            countryCode: doc.countryCode,
            vatNumber: doc.vatNumber
        });
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
        const models = await VatRequestModel.find(telegramChatId
            ? { telegramChatId: telegramChatId }
            : {}
        );

        return models.map(m => ({
            telegramChatId: m.telegramChatId,
            countryCode: m.countryCode,
            vatNumber: m.vatNumber,
            expirationDate: m.expirationDate
        }));
    });
};

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

export const addVatRequestError = async (doc: PendingVatRequest, errorMessage: string): Promise<void> => {
    return await dbCall(async () => {
        const modelToInsert = new VatRequestErrorModel({
            telegramChatId: doc.telegramChatId,
            countryCode: doc.countryCode,
            vatNumber: doc.vatNumber,
            expirationDate: doc.expirationDate,
            error: errorMessage
        });
        return await modelToInsert.save();
    });
};

export const findVatRequestError = async (doc: VatRequest): Promise<VatRequestError> => {
    return await dbCall(async () => {
        const result = await VatRequestErrorModel.findOne({
            telegramChatId: doc.telegramChatId,
            countryCode: doc.countryCode,
            vatNumber: doc.vatNumber
        });
        if (!result) {
            return null;
        }
        const { error, telegramChatId, countryCode, vatNumber, expirationDate } = result;
        return {
            vatRequest: {
                telegramChatId: telegramChatId,
                countryCode: countryCode,
                vatNumber: vatNumber,
                expirationDate: expirationDate
            },
            error: error
        };
    });
};

export const removeVatRequestErrors = async (doc: VatRequest): Promise<boolean> => {
    return await dbCall(async () => {
        const result = await VatRequestErrorModel.deleteMany({
            telegramChatId: doc.telegramChatId,
            countryCode: doc.countryCode,
            vatNumber: doc.vatNumber
        });
        return result.acknowledged;
    });
};

export const promoteErrorToVatRequest = async (vatRequestError: VatRequestError) => {
    return await dbCall(async () => {
        return await withTransaction(async () => {
            await addVatRequest(vatRequestError.vatRequest, vatRequestError.vatRequest.expirationDate);
            await removeVatRequestErrors(vatRequestError.vatRequest);
        });
    });
};

export const demoteVatRequestToError = async (vatRequest: PendingVatRequest, errorMessage: string) => {
    return await dbCall(async () => {
        return await withTransaction(async () => {
            await removeVatRequest(vatRequest);
            await addVatRequestError(vatRequest, errorMessage);
        });
    });
};

async function dbCall<TOutput>(fn: () => Promise<TOutput>) {
    // TODO: Polly?
    try {
        return await fn();
    } catch (error) {
        throw new DbError(error.message || JSON.stringify(error));
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
