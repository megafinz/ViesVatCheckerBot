import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as db from "../lib/db";
import { list, listErrors, resolveError } from "./handlers";

type Action = "list" | "listErrors" | "resolveError";
const allowedActions: Action[] = [ "list", "listErrors", "resolveError" ];

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const action = <Action>req.params.action;

    if (!action || !allowedActions.includes(action)) {
        context.res = {
            status: 400,
            body: `Missing or invalid action (should be one of: ${allowedActions.join(", ")})`
        };
        return;
    }

    await db.init();

    switch (action) {
        case "list":
            await list(context);
            return;

        case "listErrors":
            await listErrors(context);
            return;

        case "resolveError":
            await resolveError(context, req);
            return;
    }
};

export default httpTrigger;
