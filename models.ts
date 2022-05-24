export interface VatRequest {
    telegramChatId: string;
    countryCode: string;
    vatNumber: string;
}

export interface PendingVatRequest extends VatRequest {
    expirationDate: Date;
}

export interface VatRequestError {
    vatRequest: PendingVatRequest;
    error: string;
}
