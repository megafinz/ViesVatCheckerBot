import { Schema, model, connect } from "mongoose";
import { PendingVatRequest, VatRequest } from "../models";

const { MONGODB_CONNECTION_STRING, VAT_NUMBER_EXPIRATION_DAYS } = process.env;
const vatNumberExpirationDays = parseInt(VAT_NUMBER_EXPIRATION_DAYS);

let db = null;

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

export const addVatRequest = async (doc: VatRequest): Promise<void> => {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + vatNumberExpirationDays);
    const modelToInsert = new VatRequestModel({
        telegramChatId: doc.telegramChatId,
        countryCode: doc.countryCode,
        vatNumber: doc.vatNumber,
        expirationDate: expirationDate
    });
    return await modelToInsert.save();
};

export const findVatRequest = async (doc: VatRequest): Promise<PendingVatRequest> => {
    return await VatRequestModel.findOne({
        telegramChatId: doc.telegramChatId,
        countryCode: doc.countryCode,
        vatNumber: doc.vatNumber
    });
}

export const removeVatRequest = async (doc: VatRequest): Promise<boolean> => {
    const result = await VatRequestModel.deleteOne({
        telegramChatId: doc.telegramChatId,
        countryCode: doc.countryCode,
        vatNumber: doc.vatNumber
    });
    return result.acknowledged;
}

export const getAllVatRequests = async (telegramChatId?: string): Promise<PendingVatRequest[]> => {
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
};

export const countVatRequests = async (telegramChatId: string): Promise<number> => {
    return await VatRequestModel.countDocuments({ telegramChatId: telegramChatId });
}

export const removeAllVatRequests = async (telegramChatId: string): Promise<boolean> => {
    const result = await VatRequestModel.deleteMany({ telegramChatId: telegramChatId });
    return result.acknowledged;
}

export const addVatRequestError = async (doc: PendingVatRequest, errorMessage: string): Promise<void> => {
    const modelToInsert = new VatRequestErrorModel({
        telegramChatId: doc.telegramChatId,
        countryCode: doc.countryCode,
        vatNumber: doc.vatNumber,
        expirationDate: doc.expirationDate,
        error: errorMessage
    });
    return await modelToInsert.save();
};
