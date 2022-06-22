import { Context, Logger } from '@azure/functions';

const log = ((..._: any[]) => { }) as Logger;

export const context: Context = {
  invocationId: '',
  executionContext: undefined,
  bindings: undefined,
  bindingData: undefined,
  traceContext: undefined,
  bindingDefinitions: [],
  log: log,
  done: (_?: string | Error, __?: any): void => { }
};

export function tearDown() {
  context.res = {};
}
