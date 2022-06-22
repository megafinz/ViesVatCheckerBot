import * as sinon from 'sinon';
import * as utils from '../lib/utils';

export function init(fn?: (chatId: string, message: string) => Promise<void>) {
  sinon.stub(utils, 'sendTgMessage').callsFake(async (c, m) => {
    if (fn) {
      await fn(c, m);
    }
  });
}

export function tearDown() {
  sinon.restore();
}
