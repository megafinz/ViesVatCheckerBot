import * as soap from "soap";
import { VatRequest } from "../models";

const { ViesUrl } = process.env;

let vies = null;

export const init = async() => {
    if (!vies) {
        vies = await soap.createClientAsync(ViesUrl);
    }
};

export const checkVatNumber = async (vatRequest: VatRequest) => {
    // TODO: handle errors.
    const result = await vies.checkVatAsync(vatRequest);
    return result[0];
}
