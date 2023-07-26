import * as soap from 'soap';
import type { VatRequest } from '@/models';
import { ViesError } from './errors';

const { VIES_URL } = process.env;

let vies = null;

export async function init() {
  if (!vies) {
    try {
      vies = await soap.createClientAsync(VIES_URL);
    } catch (error) {
      throw new ViesError(error.message || JSON.stringify(error));
    }
  }
}

export async function checkVatNumber(vatRequest: VatRequest) {
  try {
    const result = await vies.checkVatAsync({
      countryCode: vatRequest.countryCode,
      vatNumber: vatRequest.vatNumber
    });
    return result[0];
  } catch (error) {
    throw new ViesError(error.message || JSON.stringify(error));
  }
}
