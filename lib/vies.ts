import * as soap from "soap";
import { VatRequest } from "../models";

const { VIES_URL } = process.env;

let vies = null;

export const init = async() => {
    if (!vies) {
        vies = await soap.createClientAsync(VIES_URL);
    }
};

export const checkVatNumber = async (vatRequest: VatRequest) => {
    // TODO: handle errors.
    // TODO: resilience.
    const result = await vies.checkVatAsync(vatRequest);
    return result[0];
}
