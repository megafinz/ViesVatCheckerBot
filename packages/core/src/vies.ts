import { ViesError } from './errors';

export function toViesError(error: unknown) {
  return new ViesError(errorToString(error));
}

export function errorToString(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }

  if (hasFault(error, 'fault')) {
    return JSON.stringify(error.fault);
  }

  if (hasFault(error, 'Fault')) {
    return JSON.stringify(error.Fault);
  }

  return JSON.stringify(error);
}

function hasFault<TKey extends 'fault' | 'Fault'>(
  error: unknown,
  key: TKey
): error is Record<TKey, unknown> {
  return typeof error === 'object' && error !== null && key in error;
}
