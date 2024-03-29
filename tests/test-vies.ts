import * as sinon from 'sinon';
import * as vies from '../lib/vies';
import type { VatRequest } from '../models';

export function init(fn?: (_: VatRequest) => { valid: boolean }) {
  sinon.stub(vies, 'init');
  sinon.stub(vies, 'checkVatNumber').callsFake((vatRequest: VatRequest) => {
    return fn
      ? Promise.resolve(fn(vatRequest))
      : Promise.resolve({ valid: true });
  });
}

export function tearDown() {
  sinon.restore();
}
