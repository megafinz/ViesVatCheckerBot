import * as sinon from 'sinon';
import * as utils from '../lib/utils';

export function init(fn?: (chatId: string, message: string) => void) {
  sinon.stub(utils, 'sendTgMessage').callsFake(async (c, m) => {
    if (fn) {
      fn(c, m);
    }
    return Promise.resolve();
  });
}

export function tearDown() {
  sinon.restore();
}
