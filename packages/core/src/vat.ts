export function parseVatNumber(vatNumberString: string) {
  const countryCode = vatNumberString.substring(0, 2).toUpperCase();
  const vatNumber = vatNumberString.substring(2);
  return { countryCode, vatNumber };
}

export function formatVatNumber(request: {
  countryCode: string;
  vatNumber: string;
}) {
  return `${request.countryCode}${request.vatNumber}`;
}
