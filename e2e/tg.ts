import * as sinon from 'sinon';
import * as tg from '@/lib/tg';

export function init() {
  sinon.stub(tg, 'sendMessage');
}
