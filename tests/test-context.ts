import { Context, Logger } from '@azure/functions';

const log = function () {} as Logger;
log.warn = function () {};
log.error = function () {};

export const context: Context = {
  invocationId: '',
  executionContext: {} as unknown as any,
  bindings: {} as unknown as any,
  bindingData: {} as unknown as any,
  traceContext: {} as unknown as any,
  bindingDefinitions: [],
  log,
  done: (): void => {}
};

export function tearDown() {
  context.res = {};
}
