import { Context, Logger } from "@azure/functions";

const log = ((..._: any[]) => { }) as Logger;

const testContext: Context = {
    invocationId: '',
    executionContext: undefined,
    bindings: undefined,
    bindingData: undefined,
    traceContext: undefined,
    bindingDefinitions: [],
    log: log,
    done: function (_?: string | Error, __?: any): void { }
};

export default testContext;
