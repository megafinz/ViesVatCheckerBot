export class InvalidVatNumberFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidVatNumberFormatError';
  }
}

export function parseVatNumber(vatNumberString: string) {
  const trimmed = vatNumberString.trim();
  const countryCode = trimmed.substring(0, 2).toUpperCase();
  const vatNumber = trimmed.substring(2);

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new InvalidVatNumberFormatError(
      `VAT number '${vatNumberString}' must start with a two-letter country code.`
    );
  }

  if (vatNumber.length === 0) {
    throw new InvalidVatNumberFormatError(
      `VAT number '${vatNumberString}' is missing the national number part.`
    );
  }

  if (!/^[A-Za-z0-9]+$/.test(vatNumber)) {
    throw new InvalidVatNumberFormatError(
      `VAT number '${vatNumberString}' contains invalid characters.`
    );
  }

  return { countryCode, vatNumber };
}

export function formatVatNumber(request: {
  countryCode: string;
  vatNumber: string;
}) {
  return `${request.countryCode}${request.vatNumber}`;
}
