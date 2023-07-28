export interface VatRequest {
  telegramChatId: string;
  countryCode: string;
  vatNumber: string;
}

export type VatRequestUpdate = Pick<VatRequest, 'countryCode' | 'vatNumber'>;

export interface PendingVatRequest extends VatRequest {
  expirationDate: Date;
}

export interface VatRequestError {
  id: string;
  vatRequest: PendingVatRequest;
  error: string;
}
