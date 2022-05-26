import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import * as db from "../lib/db";
import { parseVatNumber, sendTgMessage } from "../lib/utils";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
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

    await db.init();

    const vatRequestError = await db.findVatRequestError(vatRequest);

    if (!vatRequestError) {
        const message = `No errors found for VAT number '${countryCode}${vatNumber}'.`;
        context.log(message);
        context.res = { body: message };
        return;
    }

    context.log(`Re-registering the VAT number '${countryCode}${vatNumber}' for monitoring. The error message was: '${vatRequestError.error}'.`);

    await db.promoteErrorToVatRequest(vatRequestError);

    if (!silent) {
        await sendTgMessage(vatRequest.telegramChatId, `We resumed monitoring your VAT number '${countryCode}${vatNumber}'.`);
    }

    context.res = {
        body: `VAT number '${countryCode}${vatNumber}' has been re-registered for monitoring.`
    };
};

export default httpTrigger;
