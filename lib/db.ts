import { Schema, model, connect } from "mongoose";
import { VatRequest } from "../models";

const { MONGODB_CONNECTION_STRING } = process.env;

let db = null;

const VatRequestSchema = new Schema({
    telegramChatId: String,
    countryCode: String,
    vatNumber: String
});

const VatRequestModel = model("VatRequest", VatRequestSchema, "VatRequests");

export const init = async () => {
    if (!db) {
        db = await connect(MONGODB_CONNECTION_STRING);
    }
};

export const addVatRequest = async (doc: VatRequest) => {
    const modelToInsert = new VatRequestModel();
    modelToInsert["telegramChatId"] = doc.telegramChatId;
    modelToInsert["countryCode"] = doc.countryCode.toUpperCase();
    modelToInsert["vatNumber"] = doc.vatNumber;
    return await modelToInsert.save();
};

export const findVatRequest = async (doc: VatRequest) => {
    return await VatRequestModel.findOne({
        telegramChatId: doc.telegramChatId,
        countryCode: doc.countryCode,
        vatNumber: doc.vatNumber
    });
}

export const removeVatRequest = async (doc: VatRequest) => {
    return await VatRequestModel.findOneAndRemove({
        telegramChatId: doc.telegramChatId,
        countryCode: doc.countryCode,
        vatNumber: doc.vatNumber
    });
}

export const getAllVatRequests = async (telegramChatId?: string) => {
    const models = await VatRequestModel.find(telegramChatId
        ? { telegramChatId: telegramChatId }
        : {}
    );

    return models.map<VatRequest>(m => ({
        telegramChatId: m.telegramChatId,
        countryCode: m.countryCode,
        vatNumber: m.vatNumber
    }));
};
