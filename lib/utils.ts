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

export interface Logger {
  (..._: any[]): void;
}
