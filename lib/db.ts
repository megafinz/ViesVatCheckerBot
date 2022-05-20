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

const VatRequestModel = model("VatRequest", VatRequestSchema, "VatRequests");

export const init = async () => {
    if (!db) {
        db = await connect(MONGODB_CONNECTION_STRING);
    }
};

export const addVatRequest = async (doc: VatRequest): Promise<void> => {
    const modelToInsert = new VatRequestModel();
    modelToInsert["telegramChatId"] = doc.telegramChatId;
    modelToInsert["countryCode"] = doc.countryCode;
    modelToInsert["vatNumber"] = doc.vatNumber;
    modelToInsert["expirationDate"] = new Date(new Date().getDate() + vatNumberExpirationDays);
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
