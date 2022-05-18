import { AzureFunction, Context } from "@azure/functions";
import { createClientAsync } from "soap";

const timerTrigger: AzureFunction = async function (context: Context, _: any): Promise<void> {
    const url = 'https://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl';
    const client = await createClientAsync(url);
    const result = await client.checkVatAsync({ countryCode: 'PL', vatNumber: '7011078245' });
    context.res = {
        body: result[0]
    }
};

export default timerTrigger;
