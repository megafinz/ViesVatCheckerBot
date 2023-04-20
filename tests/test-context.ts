import { Context, Logger } from '@azure/functions';

export const context: Context = {
  invocationId: '',
  executionContext: {} as unknown as any,
  bindings: {} as unknown as any,
  bindingData: {} as unknown as any,
  traceContext: {} as unknown as any,
  bindingDefinitions: [],
  log: function () {} as Logger,
  done: (): void => {}
};

export function tearDown() {
  context.res = {};
}
