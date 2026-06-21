export interface VatRequest {
  telegramChatId: string;
  countryCode: string;
  vatNumber: string;
}

export interface PendingVatRequest extends VatRequest {
  expirationDate: Date;
}

export interface VatRequestErrorImport {
  sourceId: string;
  vatRequest: PendingVatRequest;
  error: string;
}

export type MigrationMode = 'verify' | 'dry-run' | 'migrate';

export interface MigrationCounts {
  pendingVatRequests: number;
  vatRequestErrors: number;
}

export interface MigrationResult {
  mode: MigrationMode;
  source: MigrationCounts;
  targetBefore: MigrationCounts;
  targetAfter: MigrationCounts;
  inserted: MigrationCounts;
  skipped: {
    pendingVatRequests: number;
  };
}

export interface MigrationSource {
  getPendingVatRequests(): Promise<PendingVatRequest[]>;
  getVatRequestErrors(): Promise<VatRequestErrorImport[]>;
}

export interface MigrationTarget {
  countPendingVatRequests(): Promise<number>;
  countVatRequestErrors(): Promise<number>;
  insertPendingVatRequest(vatRequest: PendingVatRequest): Promise<boolean>;
  insertVatRequestError(vatRequestError: VatRequestErrorImport): Promise<void>;
}
