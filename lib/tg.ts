import { default as axios } from 'axios';
import { TelegramError } from './errors';

const { TG_BOT_TOKEN } = process.env;

export async function sendMessage(
  chatId: string,
  message: string
): Promise<void> {
  const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;

  try {
    return await axios.post(tgUrl, {
      chat_id: chatId,
      text: message
    });
  } catch (error) {
    throw new TelegramError(error.message || JSON.stringify(error));
  }
}
