import { AzureFunction, Context } from "@azure/functions"
import * as db from "../lib/db";
import * as vies from "../lib/vies";
import { sendTgMessage } from "../lib/utils";

const timerTrigger: AzureFunction = async function (context: Context): Promise<void> {
    await db.init();
    await vies.init();

    const vatRequests = await db.getAllVatRequests();

    for (const vatRequest of vatRequests) {
        try {
            const result = await vies.checkVatNumber(vatRequest);

            if (result.valid) {
                context.log(`VAT number ${vatRequest.countryCode}${vatRequest.vatNumber} is valid, removing it from the validation queue`)
                await db.removeVatRequest(vatRequest);
                context.log(`Notifying Telegram User by chat id '${vatRequest.telegramChatId}'`);
                await sendTgMessage(vatRequest.telegramChatId, `🟩 Congratulations, VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is now VALID!`);
            } else if (Date.now() > vatRequest.expirationDate.getTime()) {
                context.log(`VAT number ${vatRequest.countryCode}${vatRequest.vatNumber} is expired, removing it from the validation queue`);
                await db.removeVatRequest(vatRequest);
                context.log(`Notifying Telegram User by chat id '${vatRequest.telegramChatId}'`);
                await sendTgMessage(vatRequest.telegramChatId, `🟥 You VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is no longer monitored because it's still invalid and it's been too long since you registered it. Make sure you entered the right VAT number or that the entity that this VAT number belongs to actually applied for registration in VIES.`);
                break;
            }
        } catch (error) {
            if (error.message?.includes("SERVICE_UNAVAILABLE")) {
                context.log("VIES API: service unavailable (SERVICE_UNAVAILABLE).");
                break;
            } else if (error.message?.includes("MS_UNAVAILABLE")) {
                context.log(`VIES API: API for country code '${vatRequest.countryCode}' is not available right now (MS_UNAVAILABLE)`);
                break;
            } else if (error.message?.includes("MS_MAX_CONCURRENT_REQ")) {
                context.log(`VIES API: too many concurrent requests for country code '${vatRequest.countryCode}' (MS_MAX_CONCURRENT_REQ).`);
                break;
            } else if (error.message?.includes("GLOBAL_MAX_CONCURRENT_REQ")) {
                context.log("VIES API: too many global concurrent requests (GLOBAL_MAX_CONCURRENT_REQ).");
                break;
            } else if (error.message?.includes("TIMEOUT")) {
                context.log("VIES API: timeout (TIMEOUT).");
                break;
            }

            context.log(`ERROR, putting VAT number ${vatRequest.countryCode}${vatRequest.vatNumber} into the error bin: ${error.message}`);

            await db.removeVatRequest(vatRequest);
            await db.addVatRequestError(vatRequest, error.message);

            context.log(`Notifying Telegram User by chat id '${vatRequest.telegramChatId}'`);
            await sendTgMessage(vatRequest.telegramChatId, `🟥 Sorry, something went wrong we had to stop monitoring the VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}'. We'll investigate what happened and try to resume monitoring. We'll notify you when that happens. Sorry for the inconvenience.`)
        }
    }
};

export default timerTrigger;
