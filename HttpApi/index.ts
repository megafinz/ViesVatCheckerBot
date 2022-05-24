import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { parseVatNumber } from "../lib/utils";
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

    try {
        let result: handlers.Result = null;

        if (!telegramChatId) {
            result = { success: false, message: "Missing Telegram Chat ID" };
        } else if (!allowedActions.includes(action)) {
            result = { success: false, message: `Missing or invalid action (should be one of the following: ${allowedActions.join(", ")})` };
        } else {
            switch (action) {
                case "check":
                case "uncheck":
                    const vatNumberString: string = req.query.vatNumber || req.body?.vatNumber;

                    if (!vatNumberString) {
                        result = { success: false, message: "Missing VAT number." };
                        break;
                    } else if (vatNumberString.length < 3) {
                        result = { success: false, message: "VAT number is in invalid format (expected at least 3 symbols)." };
                        break;
                    }

                    const { countryCode, vatNumber } = parseVatNumber(vatNumberString);

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
    } catch (error) {
        context.log("[ERROR]", error);
        context.res = {
            status: 500,
            body: "🟥 We're having some technical difficulties processing your request, please try again later."
        }
    }
};

export default httpTrigger;
