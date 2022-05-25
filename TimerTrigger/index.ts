import { AzureFunction, Context } from "@azure/functions"
import * as db from "../lib/db";
import * as vies from "../lib/vies";
import { sendTgMessage } from "../lib/utils";
import { isRecoverableError } from "../lib/errors";

const { NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS, TG_ADMIN_CHAT_ID } = process.env;

const timerTrigger: AzureFunction = async function (context: Context): Promise<void> {
    await db.init();
    context.log("DB initialized");

    await vies.init();
    context.log("VIES API initialized");

    const vatRequests = await db.getAllVatRequests();

    if (vatRequests.length === 0) {
        context.log("There are no VAT requests to process.");
        return;
    }

    context.log(`Processing ${vatRequests.length} VAT requests…`);

    for (const vatRequest of vatRequests) {
        try {
            const result = await vies.checkVatNumber(vatRequest);

            if (result.valid) {
                context.log(`VAT number ${vatRequest.countryCode}${vatRequest.vatNumber} is valid, removing it from the validation queue`)
                await db.removeVatRequest(vatRequest);
                context.log(`Notifying Telegram User by chat id '${vatRequest.telegramChatId}'`);
                await sendTgMessage(vatRequest.telegramChatId, `🟢 Congratulations, VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is now VALID!`);
            } else if (Date.now() > vatRequest.expirationDate.getTime()) {
                context.log(`VAT number ${vatRequest.countryCode}${vatRequest.vatNumber} is expired, removing it from the validation queue`);
                await db.removeVatRequest(vatRequest);
                context.log(`Notifying Telegram User by chat id '${vatRequest.telegramChatId}'`);
                await sendTgMessage(vatRequest.telegramChatId, `🔴 You VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is no longer monitored because it's still invalid and it's been too long since you registered it. Make sure you entered the right VAT number or that the entity that this VAT number belongs to actually applied for registration in VIES.`);
                break;
            }
        } catch (error) {
            if (isRecoverableError(error)) {
                context.log(error);
                // TODO: retry?
                return;
            }

            context.log(`ERROR, putting VAT number ${vatRequest.countryCode}${vatRequest.vatNumber} into the error bin`, error);
            await db.demoteVatRequestToError(vatRequest, error.message);
            context.log(`Notifying Telegram User by chat id '${vatRequest.telegramChatId}'`);
            await sendTgMessage(vatRequest.telegramChatId, `🔴 Sorry, something went wrong we had to stop monitoring the VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}'. We'll investigate what happened and try to resume monitoring. We'll notify you when that happens. Sorry for the inconvenience.`)

            if (NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS && TG_ADMIN_CHAT_ID) {
                context.log(`Notifying admin by Telegram chat id '${TG_ADMIN_CHAT_ID}'`);
                await sendTgMessage(TG_ADMIN_CHAT_ID, `🔴🔴🔴 [ADMIN] There was an error while processing VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}': ${error.message}`);
            }

            context.res = {
                status: 500,
                body: error.message
            };
        }
    }

    context.log(`Successfully processed ${vatRequests.length} VAT requests.`);
};

export default timerTrigger;
