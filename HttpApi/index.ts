import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { VatRequest } from "../models";
import * as db from "../lib/db";
import * as vies from "../lib/vies";

type Action = "check" | "uncheck" | "uncheckAll" | "list";

const allowedActions: Action[] = [
    "check",
    "uncheck",
    "uncheckAll",
    "list"
];

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const telegramChatId = req.query.telegramChatId || req.body?.telegramChatId;
    const action = <Action>req.params.action;

    if (!telegramChatId) {
        const message = "Missing Telegram Chat ID";
        console.log(message);
        context.res = { status: 400, body: message };
    } else if (!allowedActions.includes(action)) {
        const message = `Missing or invalid action (should be one of the following: ${allowedActions.join(", ")})`;
        console.log(message);
        context.res = { status: 400, body: message };
    } else {
        let result = null;

        switch (action) {
            case "check":
            case "uncheck":
                const countryCode = req.query.countryCode || req.body?.countryCode;
                const vatNumber = req.query.vatNumber || req.body?.vatNumber;

                if (!countryCode || !vatNumber) {
                    const message = "Missing countryCode or vatNumber";
                    console.log(message);
                    context.res = { status: 400, body: message };
                }

                const vatRequest = {
                    telegramChatId: telegramChatId,
                    countryCode: countryCode.toUpperCase(),
                    vatNumber: vatNumber
                };

                result = action === 'check' ? await check(vatRequest) : await uncheck(vatRequest);
                break;

            case "uncheckAll":
                result = await uncheckAll(telegramChatId);
                break;

            case "list":
                result = await list(telegramChatId);
                break;
        }

        console.log(result);
        context.res = { body: result };
    }
};

async function check(vatRequest: VatRequest) {
    try {
        await vies.init();
        const result = await vies.checkVatNumber(vatRequest);

        if (result.valid) {
            return `VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is valid.`;
        } else {
            await db.init();
            const existingVatRequest = await db.findVatRequest(vatRequest);

            if (existingVatRequest) {
                return `VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is not valid, but already exists in the validation queue.`;
            } else {
                await db.addVatRequest(vatRequest);
                return `VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is not valid, added it to the validation queue.`;
            }
        }
    } catch (error) {
        await db.addVatRequest(vatRequest);
        return `There was a problem validating VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}', added it to the validation queue: ${error}.`;
    }
}

async function uncheck(vatRequest: VatRequest) {
    await db.init();
    await db.removeVatRequest(vatRequest);
    return `VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' has been removed from the validation queue.`;
}

async function list(telegramChatId: string) {
    await db.init();
    const result = await db.getAllVatRequests(telegramChatId);

    if (result.length > 0) {
        return `You monitor the following VAT numbers: ${result.map(vr => `'${vr.countryCode}${vr.vatNumber}'`).join(', ')}.`;
    } else {
        return `You are not monitoring any VAT numbers.`;
    }
}

async function uncheckAll(telegramChatId: string) {
    await db.init();
    await db.removeAllVatRequests(telegramChatId);
    return "You no longer monitor any VAT numbers.";
}

export default httpTrigger;
