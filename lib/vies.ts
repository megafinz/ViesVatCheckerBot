import * as soap from "soap";
import { VatRequest } from "../models";
import { ViesError } from "./errors";

const { VIES_URL } = process.env;

let vies = null;

export const init = async() => {
    if (!vies) {
        try {
            vies = await soap.createClientAsync(VIES_URL);
        } catch (error) {
            throw new ViesError(error.message || JSON.stringify(error));
        }
    }
};

export const checkVatNumber = async (vatRequest: VatRequest) => {
    try {
        const result = await vies.checkVatAsync(vatRequest);
        return result[0];
    } catch (error) {
        throw new ViesError(error.message || JSON.stringify(error));
    }
}
