import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { VatRequest } from "../models";
import * as db from "../lib/db";
import * as vies from "../lib/vies";

const { MAX_PENDING_VAT_NUMBERS_PER_USER } = process.env;
const maxPendingVatNumbersPerUser = parseInt(MAX_PENDING_VAT_NUMBERS_PER_USER);

type Action = "check" | "uncheck" | "uncheckAll" | "list";
type Result = { success: boolean; message: string };

const allowedActions: Action[] = [
    "check",
    "uncheck",
    "uncheckAll",
    "list"
];

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const telegramChatId = req.query.telegramChatId || req.body?.telegramChatId;
    const action = <Action>req.params.action;

    let result = null;

    if (!telegramChatId) {
        result = { success: false, message: "Missing Telegram Chat ID" };
    } else if (!allowedActions.includes(action)) {
        result = { success: false, message: `Missing or invalid action (should be one of the following: ${allowedActions.join(", ")})` };
    } else {
        switch (action) {
            case "check":
            case "uncheck":
                let vatNumber: string = req.query.vatNumber || req.body?.vatNumber;

                if (!vatNumber) {
                    result = { success: false, message: "Missing VAT number." };
                    break;
                } else if (vatNumber.length < 3) {
                    result = { success: false, message: "VAT number is in invalid format (expected at least 3 symbols)." };
                    break;
                }

                const countryCode = vatNumber.substring(0, 2).toUpperCase();
                vatNumber = vatNumber.substring(2);

                const vatRequest = {
                    telegramChatId: telegramChatId,
                    countryCode: countryCode,
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

        context.log(result.message);

        context.res = {
            status: result.success ? 200 : 400,
            body: result.message
        };
    }
};

async function check(vatRequest: VatRequest): Promise<Result> {
    try {
        await vies.init();
        const result = await vies.checkVatNumber(vatRequest);

        if (result.valid) {
            return { success: true, message: `VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is valid.` };
        } else {
            await db.init();

            const existingVatRequest = await db.findVatRequest(vatRequest);

            if (!existingVatRequest) {
                const currentPendingVatNumbers = await db.countVatRequests(vatRequest.telegramChatId);

                if (currentPendingVatNumbers < maxPendingVatNumbersPerUser) {
                    await db.addVatRequest(vatRequest);
                } else {
                    return { success: false, message: `Sorry, you reached the limit of maximum VAT numbers you can monitor (${maxPendingVatNumbersPerUser}).` };
                }
            }

            return { success: true, message: `VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is not registered in VIES yet. You will be notified when it becomes valid.` };
        }
    } catch (error) {
        // TODO: recognize more unrecoverable errors
        if (error.message?.includes("INVALID_INPUT")) {
            return { success: false, message: `There was a problem validating your VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}'. Make sure it is in the correct format. This is the error message that we got from VIES:\n\n${error}.` }
        } else {
            await db.addVatRequest(vatRequest);
            return { success: false, message: `There was a problem validating your VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}'. We'll keep monitoring it for a while. This is the error message that we got from VIES:\n\n${error}.` };
        }
    }
}

async function uncheck(vatRequest: VatRequest): Promise<Result> {
    await db.init();
    await db.removeVatRequest(vatRequest);
    return { success: true, message: `VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is no longer being monitored.` };
}

async function list(telegramChatId: string): Promise<Result> {
    await db.init();
    const result = await db.getAllVatRequests(telegramChatId);

    if (result.length > 0) {
        return { success: true, message: `You monitor the following VAT numbers:\n\n${result.map(vr => `'${vr.countryCode}${vr.vatNumber}'`).join(', ')}.` };
    } else {
        return { success: true, message: "You are not monitoring any VAT numbers." };
    }
}

async function uncheckAll(telegramChatId: string): Promise<Result> {
    await db.init();
    await db.removeAllVatRequests(telegramChatId);
    return { success: true, message: "You no longer monitor any VAT numbers." };
}

export default httpTrigger;
