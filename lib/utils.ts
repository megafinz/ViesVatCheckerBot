import { ViesError } from './errors';

export function parseVatNumber(vatNumberString: string) {
  const countryCode = vatNumberString.substring(0, 2).toUpperCase();
  const vatNumber = vatNumberString.substring(2);
  return { countryCode, vatNumber };
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function errorToString(error: any) {
  try {
    return (
      error.message ||
      (error.fault && JSON.stringify(error.fault)) ||
      (error.Fault && JSON.stringify(error.Fault)) ||
      JSON.stringify(error)
    );
  } catch (anotherError) {
    const errorKeys = Object.keys(error);
    throw new ViesError(
      `Failed to represent error as string, but here are it's keys: ${errorKeys.join(
        ', '
      )}`
    );
  }
}

export interface Logger {
  (..._: any[]): void;
}
