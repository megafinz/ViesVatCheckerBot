import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import * as handlers from './handlers';

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

    let result: handlers.Result = null;

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

                result = action === 'check'
                    ? await handlers.check(vatRequest)
                    : await handlers.uncheck(vatRequest);
                break;

            case "uncheckAll":
                result = await handlers.uncheckAll(telegramChatId);
                break;

            case "list":
                result = await handlers.list(telegramChatId);
                break;
        }

        context.log(result.message);

        context.res = {
            status: result.success ? 200 : 400,
            body: result.message
        };
    }
};

export default httpTrigger;
