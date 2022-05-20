import { AzureFunction, Context } from "@azure/functions"
import * as db from "../lib/db";
import * as vies from "../lib/vies";
import { default as axios } from "axios";

const { TG_BOT_TOKEN } = process.env;

async function sendTgMessage(chatId: string, message: string) {
    const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;

    return await axios.post(tgUrl, {
        chat_id: chatId,
        text: message
    });
}

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
                await sendTgMessage(vatRequest.telegramChatId, `Congratulations, VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is now VALID!`);
            } else if (Date.now() > vatRequest.expirationDate.getTime()) {
                context.log(`VAT number ${vatRequest.countryCode}${vatRequest.vatNumber} is expired, removing it from the validation queue`);
                await db.removeVatRequest(vatRequest);
                context.log(`Notifying Telegram User by chat id '${vatRequest.telegramChatId}'`);
                await sendTgMessage(vatRequest.telegramChatId, `You VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is no longer monitored because it's still invalid and it's been too long since you registered it. Make sure you entered the right VAT number or that the entity that this VAT number belongs to actually applied for registration in VIES.`);
                break;
            }
        } catch (error) {
            // TODO: handle transient errors
            if (error.message?.includes("MS_UNAVAILABLE")) {
                context.log("VIES API is unavailable right now");
                break;
            }

            context.log(`ERROR, removing VAT number ${vatRequest.countryCode}${vatRequest.vatNumber} from validation queue: ${error.message}`);
            await db.removeVatRequest(vatRequest);
            context.log(`Notifying Telegram User by chat id '${vatRequest.telegramChatId}'`);
            await sendTgMessage(vatRequest.telegramChatId, `Sorry, something went wrong and VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' had to be removed from the validation queue.`)
        }
    }
};

export default timerTrigger;
