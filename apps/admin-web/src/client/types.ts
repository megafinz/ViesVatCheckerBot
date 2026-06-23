export interface BackendHealth {
  ok: boolean;
  service: string;
  telegramPolling: boolean;
}

export interface PendingVatRequest {
  countryCode: string;
  expirationDate: string;
  telegramChatId: string;
  vatNumber: string;
}

export interface VatRequestError {
  error: string;
  id: string;
  vatRequest: PendingVatRequest;
}
