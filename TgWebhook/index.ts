import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { Telegraf } from "telegraf";
import { default as axios } from "axios";

const { TgBotToken, TgWebhookUrl, CheckVatNumberFunctionUrl } = process.env;

const bot = new Telegraf(TgBotToken, { telegram: { webhookReply: true }});
bot.telegram.setWebhook(TgWebhookUrl);

bot.command("check", async ctx => {
    const params = ctx.update.message.text.split(' ').slice(1);

    if (params.length !== 2) {
        ctx.reply("Please provide arguments in format /check COUNTRY_CODE VAT_NUMBER");
    } else {
        try {
            const result = await axios.post(CheckVatNumberFunctionUrl, {
                action: "check",
                telegramChatId: ctx.chat.id,
                countryCode: params[0],
                vatNumber: params[1]
            });
            ctx.reply(result.data);
        } catch (error) {
            ctx.reply(error.data);
        }
    }
});

bot.command("uncheck", async ctx => {
    const params = ctx.update.message.text.split(' ').slice(1);

    if (params.length !== 2) {
        ctx.reply("Please provide arguments in format /uncheck COUNTRY_CODE VAT_NUMBER");
    } else {
        try {
            const result = await axios.post(CheckVatNumberFunctionUrl, {
                action: "uncheck",
                telegramChatId: ctx.chat.id,
                countryCode: params[0],
                vatNumber: params[1]
            });
            ctx.reply(result.data);
        } catch (error) {
            ctx.reply(error.data);
        }
    }
});

bot.command("list", async ctx => {
    try {
        const result = await axios.post(CheckVatNumberFunctionUrl, {
            action: "list",
            telegramChatId: ctx.chat.id
        });
        ctx.reply(result.data);
    } catch (error) {
        ctx.reply(error.data);
    }
});

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    return bot.handleUpdate(req.body, <any>context.res);
};

export default httpTrigger;
