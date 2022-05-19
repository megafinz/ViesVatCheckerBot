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

const timerTrigger: AzureFunction = async function (_: Context): Promise<void> {
    await db.init();
    await vies.init();

    const vatRequests = await db.getAllVatRequests();

    for (const vatRequest of vatRequests) {
        try {
            const result = await vies.checkVatNumber(vatRequest);

            if (result.valid) {
                console.log(`VAT number ${vatRequest.countryCode}${vatRequest.vatNumber} is valid, removing it from the validation queue`)
                await db.removeVatRequest(vatRequest);
                console.log(`Notifying Telegram User by chat id '${vatRequest.telegramChatId}'`);
                await sendTgMessage(vatRequest.telegramChatId, `Congratulations, VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is now VALID!`);
            }
        } catch (error) {
            // TODO: handle transient errors
            if (error.message?.contains("MS_UNAVAILABLE")) {
                console.log("VIES API is unavailable right now");
                break;
            }

            console.log(`ERROR, removing VAT number ${vatRequest.countryCode}${vatRequest.vatNumber} from validation queue: ${error.message}`);
            await db.removeVatRequest(vatRequest);
            console.log(`Notifying Telegram User by chat id '${vatRequest.telegramChatId}'`);
            await sendTgMessage(vatRequest.telegramChatId, `Sorry, something went wrong and VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' had to be removed from the validation queue.`)
        }
    }
};

export default timerTrigger;
