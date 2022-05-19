import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { Telegraf } from "telegraf";
import { default as axios } from "axios";

const { TG_BOT_TOKEN, TG_BOT_API_URL, HTTP_API_URL } = process.env;

const bot = new Telegraf(TG_BOT_TOKEN, { telegram: { webhookReply: true }});
bot.telegram.setWebhook(TG_BOT_API_URL);

bot.command("check", async ctx => {
    const params = ctx.update.message.text.split(' ').slice(1);

    if (params.length !== 1) {
        ctx.reply("Please provide a single VAT number prefixed by country code: /check VAT_NUMBER (example: /check PL1234567890).");
    } else {
        try {
            const result = await axios.post(`${HTTP_API_URL}/check`, {
                telegramChatId: ctx.chat.id,
                vatNumber: params[0]
            });
            ctx.reply(result.data);
        } catch (error) {
            ctx.reply(error.response.data);
        }
    }
});

bot.command("uncheck", async ctx => {
    const params = ctx.update.message.text.split(' ').slice(1);

    if (params.length !== 1) {
        ctx.reply("Please provide a single VAT number prefixed by country code: /uncheck VAT_NUMBER(example: /uncheck PL1234567890).");
    } else {
        try {
            const result = await axios.post(`${HTTP_API_URL}/uncheck`, {
                telegramChatId: ctx.chat.id,
                vatNumber: params[0]
            });
            ctx.reply(result.data);
        } catch (error) {
            ctx.reply(error.response.data);
        }
    }
});



bot.command("uncheckAll", async ctx => {
    try {
        const result = await axios.post(`${HTTP_API_URL}/uncheckAll`, { telegramChatId: ctx.chat.id });
        ctx.reply(result.data);
    } catch (error) {
        ctx.reply(error.response.data);
    }
});

bot.command("list", async ctx => {
    try {
        const result = await axios.get(`${HTTP_API_URL}/list?telegramChatId=${ctx.chat.id}`);
        ctx.reply(result.data);
    } catch (error) {
        ctx.reply(error.response.data);
    }
});

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    return bot.handleUpdate(req.body, <any>context.res);
};

export default httpTrigger;
