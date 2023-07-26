import { default as axios } from 'axios';
import { cfg } from './cfg';
import { TelegramError } from './errors';

export async function sendMessage(
  chatId: string,
  message: string
): Promise<void> {
  const tgUrl = `https://api.telegram.org/bot${cfg.tg.botToken}/sendMessage`;

  try {
    return await axios.post(tgUrl, {
      chat_id: chatId,
      text: message
    });
  } catch (error) {
    throw new TelegramError(error.message || JSON.stringify(error));
  }
}
