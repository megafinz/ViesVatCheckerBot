import { VatRequest } from '../models';
import * as vies from '../lib/vies';
import * as db from '../lib/db';

const { MAX_PENDING_VAT_NUMBERS_PER_USER, VAT_NUMBER_EXPIRATION_DAYS } = process.env;
const maxPendingVatNumbersPerUser = parseInt(MAX_PENDING_VAT_NUMBERS_PER_USER);
const vatNumberExpirationDays = parseInt(VAT_NUMBER_EXPIRATION_DAYS);

export type Result = { success: boolean; message: string };

export async function check(vatRequest: VatRequest): Promise<Result> {
    try {
        await vies.init();
        const result = await vies.checkVatNumber(vatRequest);

        if (result.valid) {
            return { success: true, message: `🟩 VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is valid.` };
        } else {
            await db.init();

            const existingVatRequest = await db.findVatRequest(vatRequest);

            if (!existingVatRequest) {
                const currentPendingVatNumbers = await db.countVatRequests(vatRequest.telegramChatId);

                if (currentPendingVatNumbers < maxPendingVatNumbersPerUser) {
                    await db.addVatRequest(vatRequest);
                } else {
                    return { success: false, message: `🟥 Sorry, you reached the limit of maximum VAT numbers you can monitor (${maxPendingVatNumbersPerUser}).` };
                }
            }

            return { success: true, message: `⬜️ VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is not registered in VIES yet. We will monitor it for ${vatNumberExpirationDays} days and notify you if it becomes valid (or if the monitoring period expires).` };
        }
    } catch (error) {
        if (error.message?.includes("INVALID_INPUT")) {
            return { success: false, message: `🟥 There was a problem validating your VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}'. Make sure it is in the correct format. This is the error message that we got from VIES:\n\n${error}.` }
        } else {
            await db.addVatRequest(vatRequest);
            return { success: false, message: `🟨 There was a problem validating your VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}'. We'll keep monitoring it for a while. This is the error message that we got from VIES:\n\n${error}.` };
        }
    }
}

export async function uncheck(vatRequest: VatRequest): Promise<Result> {
    await db.init();
    await db.removeVatRequest(vatRequest);
    return { success: true, message: `VAT number '${vatRequest.countryCode}${vatRequest.vatNumber}' is no longer being monitored.` };
}

export async function list(telegramChatId: string): Promise<Result> {
    await db.init();
    const result = await db.getAllVatRequests(telegramChatId);

    if (result.length > 0) {
        return { success: true, message: `You monitor the following VAT numbers:\n\n${result.map(vr => `'${vr.countryCode}${vr.vatNumber}'`).join(', ')}.` };
    } else {
        return { success: true, message: "You are not monitoring any VAT numbers." };
    }
}

export async function uncheckAll(telegramChatId: string): Promise<Result> {
    await db.init();
    await db.removeAllVatRequests(telegramChatId);
    return { success: true, message: "You no longer monitor any VAT numbers." };
}
