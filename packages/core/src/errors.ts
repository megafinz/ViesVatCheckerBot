export abstract class BaseError extends Error {
  constructor(name: string, message?: string) {
    super(message);
    this.name = name;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get isRecoverable() {
    return true;
  }

  toString(): string {
    return `[${this.name}]: ${this.message}, ${this.stack}`;
  }
}

export type ViesErrorType =
  | 'SERVICE_UNAVAILABLE'
  | 'MS_UNAVAILABLE'
  | 'MS_MAX_CONCURRENT_REQ'
  | 'GLOBAL_MAX_CONCURRENT_REQ'
  | 'TIMEOUT'
  | 'CONNECTION_ERROR'
  | 'INVALID_INPUT';

export const recoverableViesErrorTypes: ViesErrorType[] = [
  'SERVICE_UNAVAILABLE',
  'MS_UNAVAILABLE',
  'MS_MAX_CONCURRENT_REQ',
  'GLOBAL_MAX_CONCURRENT_REQ',
  'TIMEOUT',
  'CONNECTION_ERROR'
];

export const allViesErrorTypes: ViesErrorType[] = [
  ...recoverableViesErrorTypes,
  'INVALID_INPUT'
];

export class ViesError extends BaseError {
  private readonly errorType?: ViesErrorType;

  constructor(message?: string) {
    super('ViesError', message);

    this.errorType = allViesErrorTypes.find((type) => message?.includes(type));

    if (
      !this.errorType &&
      message?.includes('Unexpected root element of WSDL')
    ) {
      this.errorType = 'SERVICE_UNAVAILABLE';
    } else if (!this.errorType && message?.includes('ECONNRESET')) {
      this.errorType = 'CONNECTION_ERROR';
    } else if (!this.errorType && message?.includes('ETIMEDOUT')) {
      this.errorType = 'TIMEOUT';
    }
  }

  get type(): ViesErrorType | 'unknown' {
    return this.errorType ?? 'unknown';
  }

  override get isRecoverable(): boolean {
    return (
      this.type !== 'unknown' && recoverableViesErrorTypes.includes(this.type)
    );
  }
}

export function isRecoverableError(error: unknown): error is BaseError {
  return error instanceof BaseError && error.isRecoverable;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
