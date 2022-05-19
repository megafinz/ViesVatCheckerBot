# What's This?

This is a [Telegram bot](https://core.telegram.org/bots) implementation for checking the validity of VAT numbers in [VIES](https://ec.europa.eu/taxation_customs/vies) (VAT Information Exchange System).

# What Does It Do?

You can submit a VAT number that will be checked in VIES. If the number is valid, the bot will tell you exactly that. If the number is not valid, the bot will store the number and check it periodically until it becomes valid. The bot will notify you when that happens.

You can do the same manually here: https://ec.europa.eu/taxation_customs/vies

# How Does It Do That?

Code is [TypeScript](https://www.typescriptlang.org)/[Node.js](https://nodejs.dev) that is intended to be deployed on [Azure Functions](https://azure.microsoft.com/en-us/services/functions/). [Telegraf](https://github.com/telegraf/telegraf) is a framework of choice for handling Telegram bot interactions.

## Implementation Details

There are 3 functions:

- **TgBotApi**: HTTP Trigger that sets up Telegram webhooks and command handlers upon initialization. Webhook invocations will trigger command handlers which then delegate execution to a different HTTP Trigger: **HttpApi**.

- **HttpApi**: HTTP Trigger that can perform various actions with VAT numbers. This function can store VAT numbers in the MongoDB database and validate them against VIES API.

- **TimerTrigger**: Timer Trigger that checks all pending VAT numbers once an hour and notifies Telegram users when those numbers become valid.

# Why Does It Do That?

## Main Use Case

When you register an entity in EU, chances are that you need to be registered in VIES as well. It can take some time during which you'll probably get bored manually entering your VAT number and seeing that it's not yet valid. This bot is aimed to automate VAT number validation for you.

## Alternative Use Case

You need to verify that some other entity has a valid VAT number for transactions within EU.

# License

MIT. Feel free to use this code for whatever purposes.
