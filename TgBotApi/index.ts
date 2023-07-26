import type { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { Telegraf } from 'telegraf';
import { default as axios } from 'axios';
import { cfg } from '@/lib/cfg';

const bot = new Telegraf(cfg.tg.botToken, {
  telegram: { webhookReply: true }
});

bot.telegram.setWebhook(
  `${cfg.api.azure.tg.url}?code=${cfg.api.azure.tg.authToken}`
);

bot.command('check', async (ctx) => {
  const params = ctx.update.message.text.split(' ').slice(1);

  if (params.length !== 1) {
    ctx.reply(
      'Please provide a single VAT number prefixed by country code: /check VAT_NUMBER (example: /check PL1234567890).'
    );
    console.log('Check called with invalid params');
  } else {
    try {
      const result = await axios.post(
        `${cfg.api.azure.http.url}/check?code=${cfg.api.azure.http.authToken}`,
        {
          telegramChatId: ctx.chat.id,
          vatNumber: params[0]
        }
      );
      ctx.reply(result.data);
      console.log('Check success');
    } catch (error) {
      ctx.reply(error.response.data);
      console.log('Check failure', error.response.data);
    }
  }
});

bot.command('uncheck', async (ctx) => {
  const params = ctx.update.message.text.split(' ').slice(1);

  if (params.length !== 1) {
    ctx.reply(
      'Please provide a single VAT number prefixed by country code: /uncheck VAT_NUMBER(example: /uncheck PL1234567890).'
    );
    console.log('Uncheck called with invalid params');
  } else {
    try {
      const result = await axios.post(
        `${cfg.api.azure.http.url}/uncheck?code=${cfg.api.azure.http.authToken}`,
        {
          telegramChatId: ctx.chat.id,
          vatNumber: params[0]
        }
      );
      ctx.reply(result.data);
      console.log('Uncheck success');
    } catch (error) {
      ctx.reply(error.response.data);
      console.log('Uncheck failure', error.response.data);
    }
  }
});

bot.command('uncheckall', async (ctx) => {
  try {
    const result = await axios.post(
      `${cfg.api.azure.http.url}/uncheckAll?code=${cfg.api.azure.http.authToken}`,
      { telegramChatId: ctx.chat.id }
    );
    ctx.reply(result.data);
    console.log('UncheckAll success');
  } catch (error) {
    ctx.reply(error.response.data);
    console.log('UncheckAll failure', error.response.data);
  }
});

bot.command('list', async (ctx) => {
  try {
    const result = await axios.get(
      `${cfg.api.azure.http.url}/list?telegramChatId=${ctx.chat.id}&code=${cfg.api.azure.http.authToken}`
    );
    ctx.reply(result.data);
    console.log('List success');
  } catch (error) {
    ctx.reply(error.response.data);
    console.log('List failure', error.response.data);
  }
});

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  context.log('Webhook triggered');
  return bot.handleUpdate(req.body, <any>context.res);
};

export default httpTrigger;
