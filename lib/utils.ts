import { default as axios } from "axios";

const { TG_BOT_TOKEN } = process.env;

export async function sendTgMessage(chatId: string, message: string): Promise<void> {
    const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;

    return await axios.post(tgUrl, {
        chat_id: chatId,
        text: message
    });
}

export function parseVatNumber(vatNumberString: string) {
    const countryCode = vatNumberString.substring(0, 2).toUpperCase();
    const vatNumber = vatNumberString.substring(2);
    return { countryCode, vatNumber };
}
