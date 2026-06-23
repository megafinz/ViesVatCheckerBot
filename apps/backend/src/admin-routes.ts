import {
  formatVatNumber,
  type PendingVatRequest,
  parseVatNumber,
  type VatRequest,
  type VatRequestError
} from '@viesvatchecker/core';
import type { ResolveVatRequestErrorResult } from '@viesvatchecker/db';
import { Elysia } from 'elysia';

export interface AdminRepository {
  getAllVatRequests(): Promise<PendingVatRequest[]>;
  getAllVatRequestErrors(): Promise<VatRequestError[]>;
  removeVatRequestError(vatRequestErrorId: string): Promise<boolean>;
  resolveVatRequestError(
    vatRequestErrorId: string
  ): Promise<ResolveVatRequestErrorResult>;
  updateVatRequest(
    vatRequest: VatRequest,
    update: Pick<VatRequest, 'countryCode' | 'vatNumber'>
  ): Promise<boolean>;
}

export interface AdminTelegram {
  sendMessage(chatId: string, text: string): Promise<void>;
}

export interface AdminRoutesOptions {
  internalApiToken: string;
  repository: AdminRepository;
  telegram: AdminTelegram;
}

type UpdateVatRequestBody = {
  newVatNumber?: string;
  telegramChatId?: string;
  vatNumber?: string;
};

export function createAdminRoutes(options: AdminRoutesOptions) {
  return new Elysia()
    .onBeforeHandle(({ request }) => {
      if (
        request.headers.get('authorization') !==
        `Bearer ${options.internalApiToken}`
      ) {
        return new Response('Unauthorized', { status: 401 });
      }
    })
    .get('/internal/admin/vat-requests', async () => {
      return await options.repository.getAllVatRequests();
    })
    .patch('/internal/admin/vat-requests', async ({ body }) => {
      const updateRequest = body as UpdateVatRequestBody;
      const telegramChatId = updateRequest.telegramChatId;
      if (!telegramChatId) {
        return new Response('Missing Telegram Chat ID', { status: 400 });
      }

      const vatNumber = updateRequest.vatNumber;
      if (!vatNumber) {
        return new Response('Missing VAT Number', { status: 400 });
      }

      const newVatNumber = updateRequest.newVatNumber;
      if (!newVatNumber) {
        return new Response('Missing new VAT Number', { status: 400 });
      }

      if (vatNumber === newVatNumber) {
        return new Response(null, { status: 204 });
      }

      const vatRequest = parseVatNumber(vatNumber);
      const newVatRequest = parseVatNumber(newVatNumber);
      const updated = await options.repository.updateVatRequest(
        {
          telegramChatId,
          ...vatRequest
        },
        newVatRequest
      );

      if (!updated) {
        return new Response(
          `VAT Request with number '${vatNumber}' and Telegram Chat ID '${telegramChatId}' not found.`,
          { status: 404 }
        );
      }

      return new Response(null, { status: 204 });
    })
    .get('/internal/admin/vat-request-errors', async () => {
      return await options.repository.getAllVatRequestErrors();
    })
    .post('/internal/admin/vat-request-errors/resolve', async ({ query }) => {
      const errors = await options.repository.getAllVatRequestErrors();

      for (const error of [...errors]) {
        await resolveError({
          errorId: error.id,
          options,
          silent: isTruthy(query.silent)
        });
      }

      return new Response(null, { status: 204 });
    })
    .post(
      '/internal/admin/vat-request-errors/:errorId/resolve',
      async ({ params, query }) => {
        return await resolveError({
          errorId: params.errorId,
          options,
          silent: isTruthy(query.silent)
        });
      }
    )
    .post('/internal/admin/vat-request-errors/:errorId', async ({ params }) => {
      return await resolveError({
        errorId: params.errorId,
        options,
        silent: false
      });
    })
    .delete(
      '/internal/admin/vat-request-errors/:errorId',
      async ({ params }) => {
        const removed = await options.repository.removeVatRequestError(
          params.errorId
        );

        if (!removed) {
          return new Response(
            `VAT Request Error with id '${params.errorId}' not found`,
            { status: 404 }
          );
        }

        return new Response(null, { status: 204 });
      }
    );
}

async function resolveError(input: {
  errorId: string;
  options: AdminRoutesOptions;
  silent: boolean;
}) {
  const result = await input.options.repository.resolveVatRequestError(
    input.errorId
  );

  if (result.type === 'error-not-found') {
    return new Response(
      `VAT Request Error with id '${input.errorId}' not found`,
      { status: 404 }
    );
  }

  if (
    !input.silent &&
    result.type === 'all-errors-resolved-and-vat-request-monitoring-is-resumed'
  ) {
    await input.options.telegram.sendMessage(
      result.vatRequest.telegramChatId,
      `We resumed monitoring your VAT number '${formatVatNumber(result.vatRequest)}'.`
    );
  }

  return new Response(null, { status: 204 });
}

function isTruthy(value: unknown) {
  return value === true || value === 'true' || value === '1';
}
