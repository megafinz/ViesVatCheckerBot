import * as sinon from 'sinon';
import * as tg from '@/lib/tg';

export function init(fn?: (_: string, __: string) => void) {
  sinon.stub(tg, 'sendMessage').callsFake(async (c, m) => {
    if (fn) {
      fn(c, m);
    }
    return Promise.resolve();
  });
}

export function tearDown() {
  sinon.restore();
}
