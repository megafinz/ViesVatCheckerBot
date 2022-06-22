import { Context, Logger } from '@azure/functions';

export const context: Context = {
  invocationId: '',
  executionContext: undefined,
  bindings: undefined,
  bindingData: undefined,
  traceContext: undefined,
  bindingDefinitions: [],
  log: function(..._: any[]) { } as Logger,
  done: (_?: string | Error, __?: any): void => { }
};

export function tearDown() {
  context.res = {};
}
