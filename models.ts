export interface VatRequest {
    telegramChatId: string;
    countryCode: string;
    vatNumber: string;
}

export interface PendingVatRequest extends VatRequest {
    expirationDate: Date;
}
