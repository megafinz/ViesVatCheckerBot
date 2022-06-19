import { Context, HttpRequest } from "@azure/functions";
import * as db from "../lib/db";
import { parseVatNumber, sendTgMessage } from "../lib/utils";
import { VatRequestError } from "../models";

export async function list(context: Context) {
    context.res = {
        body: await db.getAllVatRequests()
    };
}

export async function listErrors(context: Context) {
    context.res = {
        body: await db.getAllVatRequestErrors()
    };
}

export async function resolveError(context: Context, req: HttpRequest) {
    const telegramChatId = req.query.telegramChatId || req.body?.telegramChatId;
    const silent = req.query.silent || req.body?.silent || false;

    if (!telegramChatId) {
        context.res = {
            status: 400,
            body: "Missing Telegram chat ID"
        };
        return;
    }

    const vatNumberString = req.query.vatNumber || req.body?.vatNumber;

    if (!vatNumberString) {
        context.res = {
            status: 400,
            body: "Missing VAT number"
        };
        return;
    }

    const { countryCode, vatNumber } = parseVatNumber(vatNumberString);

    const vatRequest = {
        telegramChatId: telegramChatId,
        countryCode: countryCode,
        vatNumber: vatNumber
    };

    const vatRequestError = await db.findVatRequestError(vatRequest);

    if (!vatRequestError) {
        const message = `No errors found for VAT number '${countryCode}${vatNumber}'.`;
        context.log(message);
        context.res = { status: 404, body: message };
        return;
    }

    await promoteErrorToVatRequest(context, vatRequestError, silent);

    context.res = {
        body: `VAT number '${countryCode}${vatNumber}' has been re-registered for monitoring.`
    };
}

export async function resolveAllErrors(context: Context, req: HttpRequest) {
    const silent = req.query.silent || req.body?.silent || false;
    const vatRequestErrors = await db.getAllVatRequestErrors();

    for (const vatRequestError of vatRequestErrors) {
        await promoteErrorToVatRequest(context, vatRequestError, silent);
    }

    context.res = {
        body: `All faulted VAT Numbers have been re-registered for monitoring.`
    };
}

async function promoteErrorToVatRequest(context: Context, vatRequestError: VatRequestError, silent: boolean) {
    const vatNumber = `${vatRequestError.vatRequest.countryCode}${vatRequestError.vatRequest.vatNumber}`;

    context.log(`Re-registering the VAT number '${vatNumber}' for monitoring. The error message was: '${vatRequestError.error}'.`);

    await db.promoteErrorToVatRequest(vatRequestError);

    if (!silent) {
        await sendTgMessage(vatRequestError.vatRequest.telegramChatId, `We resumed monitoring your VAT number '${vatNumber}'.`);
    }
}
