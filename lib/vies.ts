import * as soap from 'soap';
import type { VatRequest } from '../models';
import { cfg } from './cfg';
import { ViesError } from './errors';

let vies = null;

export async function init() {
  if (!vies) {
    try {
      vies = await soap.createClientAsync(cfg.vies.url);
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
