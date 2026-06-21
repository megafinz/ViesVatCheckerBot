export interface VatRequest {
  telegramChatId: string;
  countryCode: string;
  vatNumber: string;
}

export interface PendingVatRequest extends VatRequest {
  expirationDate: Date;
}

export interface VatRequestError {
  id: string;
  vatRequest: PendingVatRequest;
  error: string;
}

export type VatValidationResult = {
  valid: boolean;
};

export interface ViesClient {
  checkVatNumber(vatRequest: VatRequest): Promise<VatValidationResult>;
}

export type CoreResponseBody =
  | { type: 'success'; message: string }
  | { type: 'error'; message: string; error?: unknown };

export interface CoreResponse {
  status: number;
  body: CoreResponseBody;
}
