import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { Telegraf } from "telegraf";
import { default as axios } from "axios";

const { TG_BOT_TOKEN, TG_BOT_API_URL, TG_BOT_API_TOKEN, HTTP_API_URL, HTTP_API_TOKEN } = process.env;

const bot = new Telegraf(TG_BOT_TOKEN, { telegram: { webhookReply: true }});
bot.telegram.setWebhook(`${TG_BOT_API_URL}?code=${TG_BOT_API_TOKEN}`);

bot.command("check", async ctx => {
    const params = ctx.update.message.text.split(' ').slice(1);

    if (params.length !== 1) {
        ctx.reply("Please provide a single VAT number prefixed by country code: /check VAT_NUMBER (example: /check PL1234567890).");
        console.log("Check called with invalid params");
    } else {
        try {
            const result = await axios.post(`${HTTP_API_URL}/check?code=${HTTP_API_TOKEN}`, {
                telegramChatId: ctx.chat.id,
                vatNumber: params[0]
            });
            ctx.reply(result.data);
            console.log("Check success");
        } catch (error) {
            ctx.reply(error.response.data);
            console.log("Check failure");
        }
    }
});

bot.command("uncheck", async ctx => {
    const params = ctx.update.message.text.split(' ').slice(1);

    if (params.length !== 1) {
        ctx.reply("Please provide a single VAT number prefixed by country code: /uncheck VAT_NUMBER(example: /uncheck PL1234567890).");
        console.log("Uncheck called with invalid params");
    } else {
        try {
            const result = await axios.post(`${HTTP_API_URL}/uncheck?code=${HTTP_API_TOKEN}`, {
                telegramChatId: ctx.chat.id,
                vatNumber: params[0]
            });
            ctx.reply(result.data);
            console.log("Uncheck success");
        } catch (error) {
            ctx.reply(error.response.data);
            console.log("Uncheck failure");
        }
    }
});

bot.command("uncheckAll", async ctx => {
    try {
        const result = await axios.post(`${HTTP_API_URL}/uncheckAll?code=${HTTP_API_TOKEN}`, { telegramChatId: ctx.chat.id });
        ctx.reply(result.data);
        console.log("UncheckAll success");
    } catch (error) {
        ctx.reply(error.response.data);
        console.log("UncheckAll failure");
    }
});

bot.command("list", async ctx => {
    try {
        const result = await axios.get(`${HTTP_API_URL}/list?telegramChatId=${ctx.chat.id}&code=${HTTP_API_TOKEN}`);
        ctx.reply(result.data);
        console.log("List success");
    } catch (error) {
        ctx.reply(error.response.data);
        console.log("List failure");
    }
});

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    console.log("Webhook triggered");
    return bot.handleUpdate(req.body, <any>context.res);
};

export default httpTrigger;
