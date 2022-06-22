import { expect } from 'chai';
import * as db from '../lib/db';
import * as testContext from './test-context';
import * as testDb from './test-db';
import * as testVies from './test-vies';
import * as testTg from './test-tg';
import timerTrigger from '../TimerTrigger';
import { VatRequest } from '../models';
import { RecoverableViesErrorTypes, ViesError } from '../lib/errors';

const fakeVatRequest: VatRequest = {
  telegramChatId: '123',
  countryCode: 'XX',
  vatNumber: '123'
};

describe('TimerTrigger Tests', () => {
  before(async () => {
    await testDb.init();
  });

  it('Should finish without errors when there are no VAT Requests in db', async () => {
    // Act / Assert.
    expect(async () => {
      await timerTrigger(testContext.context);
    }).to.not.throw;
  });

  it('Should remove valid VAT Request from db and notify user by Telegram', async () => {
    // Arrange.
    let telegramChatId = null;
    let telegramMessage = null;
    testTg.init((chatId, message) => {
      telegramChatId = chatId;
      telegramMessage = message;
    });
    testVies.init(() => ({ valid: true }));
    await db.addVatRequest(fakeVatRequest);

    // Act.
    await timerTrigger(testContext.context);

    // Assert.
    expect(telegramChatId).to.equal('123');
    expect(telegramMessage).to.contain(`Congratulations, VAT number 'XX123' is now VALID!`);
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.be.empty;
  });

  it('Should not remove invalid valid VAT Request from db and should not notify user by Telegram', async () => {
    // Arrange.
    let telegramCalled = false;
    testTg.init(() => {
      telegramCalled = true;
    });
    testVies.init(() => ({ valid: false }));
    const pendingVatRequest = await db.addVatRequest(fakeVatRequest);

    // Act.
    await timerTrigger(testContext.context);

    // Assert.
    expect(telegramCalled).to.be.false;
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.be.eql([pendingVatRequest]);
  });

  it('Should remove invalid VAT Request from db if it is expired and notify user by Telegram', async () => {
    // Arrange.
    let telegramChatId = null;
    let telegramMessage = null;
    testTg.init((chatId, message) => {
      telegramChatId = chatId;
      telegramMessage = message;
    });
    testVies.init(() => ({ valid: false }));
    await db.addVatRequest(fakeVatRequest, new Date(0));

    // Act.
    await timerTrigger(testContext.context);

    // Assert.
    expect(telegramChatId).to.equal('123');
    expect(telegramMessage).to.contain(`You VAT number 'XX123' is no longer monitored because it's still invalid and it's been too long since you registered it`);
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.be.empty;
  });

  for (const error of RecoverableViesErrorTypes) {
    it(`Should finish without errors when recoverable error (${error}) happens during VAT Request validation`, async () => {
      // Arrange.
      testVies.init(() => {
        throw new ViesError(`bla bla ${error} bla bla`);
      });

      await db.addVatRequest(fakeVatRequest);

      // Act / Assert.
      expect(async () => {
        await timerTrigger(testContext.context);
      }).to.not.throw;
    });
  }

  for (const error of RecoverableViesErrorTypes) {
    it(`Should not demote VAT Request to error when recoverable VIES error (${error}) happens during VAT Request validation`, async () => {
      // Arrange.
      testVies.init(() => {
        throw new ViesError(`bla bla ${error} bla bla`);
      });

      const pendingVatRequest = await db.addVatRequest(fakeVatRequest);

      // Act.
      await timerTrigger(testContext.context);

      // Assert.
      const vatRequests = await db.getAllVatRequests();
      const vatRequestErrors = await db.getAllVatRequestErrors();
      expect(vatRequests).to.be.eql([pendingVatRequest]);
      expect(vatRequestErrors).to.be.empty;
    });
  }

  it(`Should demote VAT Request to error when any other error happens during VAT Request validation`, async () => {
    // Arrange.
    testTg.init();

    testVies.init(() => {
      throw new Error('Oops');
    });

    const pendingVatRequest = await db.addVatRequest(fakeVatRequest);

    // Act.
    await timerTrigger(testContext.context);

    // Assert.
    const vatRequests = await db.getAllVatRequests();
    const vatRequestErrors = (await db.getAllVatRequestErrors()).map(x => {
      delete x.id;
      return x;
    });
    expect(vatRequests).to.be.empty;
    expect(vatRequestErrors).to.be.eql([{
      vatRequest: pendingVatRequest,
      error: 'Oops'
    }]);
  });

  it(`Should notify user by Telegram when VAT Request is demoted to error`, async () => {
    // Arrange.
    let telegramChatId = null;
    let telegramMessage = null;

    testTg.init((chatId, message) => {
      telegramChatId = chatId;
      telegramMessage = message;
    });

    testVies.init(() => {
      throw new Error('Oops');
    });

    await db.addVatRequest(fakeVatRequest);

    // Act.
    await timerTrigger(testContext.context);

    // Assert.
    expect(telegramChatId).to.be.equal('123');
    expect(telegramMessage).to.contain(`Sorry, something went wrong and we had to stop monitoring the VAT number 'XX123'`);
  });

  afterEach(async () => {
    testContext.tearDown();
    testVies.tearDown();
    testTg.tearDown();
    await testDb.clear();
  });

  after(async () => {
    await testDb.tearDown();
  });
});
