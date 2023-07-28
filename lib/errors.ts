export abstract class BaseError extends Error {
  constructor(name: string, message?: string) {
    super(message);
    this.name = name;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get isRecoverable() {
    return true;
  }

  public toString(): string {
    return `[${this.name}]: ${this.message}, ${this.stack}`;
  }
}

export class TelegramError extends BaseError {
  constructor(message?: string) {
    super('TelegramError', message);
  }
}

export class DbError extends BaseError {
  constructor(message?: string) {
    super('DbError', message);
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

export const RecoverableViesErrorTypes: ViesErrorType[] = [
  'SERVICE_UNAVAILABLE',
  'MS_UNAVAILABLE',
  'MS_MAX_CONCURRENT_REQ',
  'GLOBAL_MAX_CONCURRENT_REQ',
  'TIMEOUT',
  'CONNECTION_ERROR'
];

export const AllViesErrorTypes: ViesErrorType[] = [
  ...RecoverableViesErrorTypes,
  'INVALID_INPUT'
];

export class ViesError extends BaseError {
  private _type: ViesErrorType;

  constructor(message?: string) {
    super('ViesError', message);

    this._type = AllViesErrorTypes.find((x) => message.includes(x));

    if (!this._type && message?.includes('Unexpected root element of WSDL')) {
      // Likely VIES endoint didn't output valid WSDL because it's down.
      this._type = 'SERVICE_UNAVAILABLE';
    } else if (!this._type && message?.includes('ECONNRESET')) {
      this._type = 'CONNECTION_ERROR';
    } else if (!this._type && message?.includes('ETIMEDOUT')) {
      this._type = 'TIMEOUT';
    }
  }

  public get type(): ViesErrorType | 'unknown' {
    return this._type || 'unknown';
  }

  public get isRecoverable(): boolean {
    return (
      this.type !== 'unknown' && RecoverableViesErrorTypes.includes(this.type)
    );
  }
}

export function isRecoverableError(error: Error): error is BaseError {
  if (error instanceof BaseError) {
    return error.isRecoverable;
  }

  return false;
}
