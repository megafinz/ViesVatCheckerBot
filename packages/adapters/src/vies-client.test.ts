import { expect, test } from 'bun:test';
import { createViesHttpClient, resolveViesEndpoint } from './vies-client';

test('resolveViesEndpoint converts the legacy WSDL URL to the SOAP service endpoint', () => {
  expect(
    resolveViesEndpoint(
      'https://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl'
    )
  ).toBe('https://ec.europa.eu/taxation_customs/vies/checkVatService');
});

test('VIES HTTP client posts a SOAP checkVat request and parses valid response', async () => {
  const requests: Request[] = [];
  const client = createViesHttpClient({
    fetch: async (request) => {
      requests.push(request);
      return new Response(`
        <soap:Envelope>
          <soap:Body>
            <checkVatResponse>
              <valid>true</valid>
            </checkVatResponse>
          </soap:Body>
        </soap:Envelope>
      `);
    },
    url: 'https://example.com/checkVatService.wsdl'
  });

  const result = await client.checkVatNumber({
    telegramChatId: '123',
    countryCode: 'PL',
    vatNumber: '1234567890'
  });

  expect(result).toEqual({ valid: true });
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe('https://example.com/checkVatService');
  expect(requests[0].headers.get('content-type')).toContain('text/xml');
  expect(await requests[0].text()).toContain(
    '<urn:countryCode>PL</urn:countryCode>'
  );
});
