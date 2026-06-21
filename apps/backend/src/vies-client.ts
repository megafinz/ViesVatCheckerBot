import { toViesError, type ViesClient } from '@viesvatchecker/core';

type Fetch = (request: Request) => Promise<Response>;

export interface ViesHttpClientOptions {
  fetch?: Fetch;
  url: string;
}

export function createViesHttpClient(
  options: ViesHttpClientOptions
): ViesClient {
  const fetchImpl = options.fetch ?? fetch;
  const endpoint = resolveViesEndpoint(options.url);

  return {
    async checkVatNumber(vatRequest) {
      try {
        const response = await fetchImpl(
          new Request(endpoint, {
            body: createCheckVatEnvelope(
              vatRequest.countryCode,
              vatRequest.vatNumber
            ),
            headers: {
              'content-type': 'text/xml; charset=utf-8',
              soapaction: ''
            },
            method: 'POST'
          })
        );

        if (!response.ok) {
          throw new Error(`VIES responded with HTTP ${response.status}`);
        }

        const body = await response.text();
        const valid = parseValidResult(body);

        if (valid === null) {
          throw new Error('VIES response did not contain a valid result');
        }

        return { valid };
      } catch (error) {
        throw toViesError(error);
      }
    }
  };
}

export function resolveViesEndpoint(url: string): string {
  return url.endsWith('.wsdl') ? url.slice(0, -'.wsdl'.length) : url;
}

function createCheckVatEnvelope(
  countryCode: string,
  vatNumber: string
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:checkVat>
      <urn:countryCode>${escapeXml(countryCode)}</urn:countryCode>
      <urn:vatNumber>${escapeXml(vatNumber)}</urn:vatNumber>
    </urn:checkVat>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function parseValidResult(body: string): boolean | null {
  const match = body.match(/<valid>\s*(true|false)\s*<\/valid>/i);

  if (!match) {
    return null;
  }

  return match[1].toLowerCase() === 'true';
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
