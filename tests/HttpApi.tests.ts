import { expect } from 'chai';
import * as db from '../lib/db';
import { RecoverableViesErrorTypes, ViesError } from '../lib/errors';
import type { VatRequest } from '../models';
import httpApi from '../HttpApi';
import * as testContext from './test-context';
import * as testDb from './test-db';
import * as testTg from './test-tg';
import * as testVies from './test-vies';

const MAX_PENDING_VAT_NUMBERS_PER_USER = 10;

const fakeVatRequest1: VatRequest = {
  telegramChatId: '123',
  countryCode: 'XX',
  vatNumber: '123'
};

const fakeVatRequest2: VatRequest = {
  telegramChatId: '234',
  countryCode: 'YY',
  vatNumber: '234'
};

const fakeVatRequest3: VatRequest = {
  telegramChatId: '234',
  countryCode: 'ZZ',
  vatNumber: '345'
};

describe('HTTP API Tests', () => {
  before(async () => {
    await testDb.init();
  });

  it('Missing Telegram Chat ID should result in 400', async () => {
    // Act.
    await httpApi(testContext.context, {
      query: {},
      params: {}
    });

    // Arrange.
    expect(testContext.context.res?.status).to.equal(400);
    expect(testContext.context.res?.body).to.equal('Missing Telegram Chat ID');
  });

  it('Missing action should result in 400', async () => {
    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123'
      },
      params: {}
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(400);
    expect(testContext.context.res?.body).to.contain(
      'Missing or invalid action'
    );
  });

  it('Unsupported action should result in 400', async () => {
    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123'
      },
      params: {
        action: 'xxx'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(400);
    expect(testContext.context.res?.body).to.contain(
      'Missing or invalid action'
    );
  });

  it(`'check' action without VAT number should result in 400`, async () => {
    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123'
      },
      params: {
        action: 'check'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(400);
    expect(testContext.context.res?.body).to.equal('Missing VAT number.');
  });

  it(`'check' action with invalid VAT number should result in 400`, async () => {
    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'x'
      },
      params: {
        action: 'check'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(400);
    expect(testContext.context.res?.body).to.contain(
      'VAT number is in invalid format'
    );
  });

  it(`'check' action should not add VAT Request to db if it's already valid`, async () => {
    // Arrange.
    testVies.init();

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'XX123'
      },
      params: {
        action: 'check'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(200);
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.be.empty;
  });

  it(`'check' action should remove the existing VAT Request from db if it turns out valid`, async () => {
    // Arrange.
    testVies.init();
    await db.addVatRequest(fakeVatRequest1);

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'XX123'
      },
      params: {
        action: 'check'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(200);
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.be.empty;
  });

  it(`'check' action should add VAT Request to db if it's not valid yet`, async () => {
    // Arrange.
    testVies.init(() => ({ valid: false }));

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'XX123'
      },
      params: {
        action: 'check'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(200);
    const vatRequests = (await db.getAllVatRequests()).map((x) => {
      const { expirationDate: _, ...rest } = x;
      return { ...rest };
    });
    expect(vatRequests).to.eql([fakeVatRequest1]);
  });

  it(`'check' action should add VAT Request to db with default expiration time of 90 days`, async () => {
    // Arrange.
    testVies.init(() => ({ valid: false }));

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'XX123'
      },
      params: {
        action: 'check'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(200);
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.be.of.length(1);
    const now = new Date();
    const diffTime = vatRequests[0].expirationDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / 1000 / 60 / 60 / 24);
    expect(diffDays).be.equal(90);
  });

  it(`'check' action should not add VAT Request to db if there are too many (${MAX_PENDING_VAT_NUMBERS_PER_USER} by default) VAT requests for a given user`, async () => {
    // Arrange.
    testVies.init(() => ({ valid: false }));

    for (let i = 0; i < MAX_PENDING_VAT_NUMBERS_PER_USER; i++) {
      await db.addVatRequest(fakeVatRequest1);
    }

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'XX123'
      },
      params: {
        action: 'check'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(400);
    expect(testContext.context.res?.body).to.contain(
      'Sorry, you reached the limit of maximum VAT numbers you can monitor'
    );
  });

  it(`'check' action should not add VAT Request to db if it's already there`, async () => {
    // Arrange.
    testVies.init(() => ({ valid: false }));
    await db.addVatRequest(fakeVatRequest1);

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'XX123'
      },
      params: {
        action: 'check'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(200);
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.be.of.length(1);
  });

  it(`'check' action should result in 400 if VIES replies with INVALID_INPUT`, async () => {
    // Arrange.
    testVies.init(() => {
      throw new ViesError('bla bla INVALID_INPUT bla bla');
    });

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'XX123'
      },
      params: {
        action: 'check'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(400);
    expect(testContext.context.res?.body).to.contain(
      'Make sure it is in the correct format'
    );
  });

  for (const error of RecoverableViesErrorTypes) {
    it(`'check' action should result in 500 and should add VAT Request to db if VIES replies with ${error}`, async () => {
      // Arrange.
      testVies.init(() => {
        throw new ViesError(`bla bla ${error} bla bla`);
      });

      // Act.
      await httpApi(testContext.context, {
        query: {
          telegramChatId: '123',
          vatNumber: 'XX123'
        },
        params: {
          action: 'check'
        }
      });

      // Assert.
      expect(testContext.context.res?.status).to.equal(500);
      expect(testContext.context.res?.body).to.contain(
        `We'll keep monitoring it for a while`
      );
      const vatRequests = (await db.getAllVatRequests()).map((x) => {
        const { expirationDate: _, ...rest } = x;
        return { ...rest };
      });
      expect(vatRequests).to.eql([fakeVatRequest1]);
    });
  }

  it(`'check' action should result in 500 and should not add VAT Request to db if VIES replies with unknown error`, async () => {
    // Arrange.
    testVies.init(() => {
      throw new ViesError(`bla bla THIS ERROR IS UNKNOWN bla bla`);
    });

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'XX123'
      },
      params: {
        action: 'check'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(500);
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.be.empty;
  });

  it(`'check' action should result in 500 and should not add VAT Request to db in case of any other error`, async () => {
    // Arrange.
    testVies.init(() => {
      throw new Error();
    });

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'XX123'
      },
      params: {
        action: 'check'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(500);
    expect(testContext.context.res?.body).to.contain(
      `We're having some technical difficulties processing your request, please try again later`
    );
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.be.empty;
  });

  it(`'uncheck' action without VAT number should result in 400`, async () => {
    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123'
      },
      params: {
        action: 'uncheck'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(400);
    expect(testContext.context.res?.body).to.equal('Missing VAT number.');
  });

  it(`'uncheck' action with invalid VAT number should result in 400`, async () => {
    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'x'
      },
      params: {
        action: 'uncheck'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(400);
    expect(testContext.context.res?.body).to.contain(
      'VAT number is in invalid format'
    );
  });

  it(`'uncheck' action should result in 400 even if there is nothing to uncheck`, async () => {
    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'XX123'
      },
      params: {
        action: 'uncheck'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(200);
    expect(testContext.context.res?.body).to.contain(
      `VAT number 'XX123' is no longer being monitored`
    );
  });

  it(`'uncheck' action should result in 200 and remove VAT Request from db if it's there`, async () => {
    // Arrange.
    await db.addVatRequest(fakeVatRequest1);

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123',
        vatNumber: 'XX123'
      },
      params: {
        action: 'uncheck'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(200);
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.be.empty;
  });

  it(`'list' action should result in 200 and mention a list of VAT Requests for the given Telegram Chat ID`, async () => {
    // Arrange.
    await db.addVatRequest(fakeVatRequest1);

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123'
      },
      params: {
        action: 'list'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(200);
    expect(testContext.context.res?.body).to.contain(
      `${fakeVatRequest1.countryCode}${fakeVatRequest1.vatNumber}`
    );
  });

  it(`'list' action should result in 200 and should not mention VAT Requests for different Telegram Chat IDs`, async () => {
    // Arrange.
    await db.addVatRequest(fakeVatRequest2);

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123'
      },
      params: {
        action: 'list'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(200);
    expect(testContext.context.res?.body).to.not.contain(
      `${fakeVatRequest2.countryCode}${fakeVatRequest2.vatNumber}`
    );
  });

  it(`'list' action should result in 200 even if there are no VAT Numbers for the given Telegram Chat ID`, async () => {
    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123'
      },
      params: {
        action: 'list'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(200);
    expect(testContext.context.res?.body).to.equal(
      'You are not monitoring any VAT numbers.'
    );
  });

  it(`'uncheckAll' action should result in 200 and remove all monitored VAT Numbers from db for the given Telegram Chat ID`, async () => {
    // Arrange.
    await db.addVatRequest(fakeVatRequest2);
    await db.addVatRequest(fakeVatRequest3);

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '234'
      },
      params: {
        action: 'uncheckAll'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(200);
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.be.empty;
  });

  it(`'uncheckAll' action should result in 200 and should not remove any VAT Numbers from db for other Telegram Chat IDs`, async () => {
    // Arrange.
    await db.addVatRequest(fakeVatRequest1);
    const pendingVatRequest = await db.addVatRequest(fakeVatRequest2);

    // Act.
    await httpApi(testContext.context, {
      query: {
        telegramChatId: '123'
      },
      params: {
        action: 'uncheckAll'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(200);
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.be.eql([pendingVatRequest]);
  });

  afterEach(async () => {
    testContext.tearDown();
    testTg.tearDown();
    testVies.tearDown();
    await testDb.clear();
  });

  after(async () => {
    await testDb.tearDown();
  });
});
