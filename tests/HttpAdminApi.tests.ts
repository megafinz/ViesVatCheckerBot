import { expect } from 'chai';
import httpAdminApi from '../HttpAdminApi';
import * as db from '../lib/db';
import type { PendingVatRequest } from '../models';
import * as testContext from './test-context';
import * as testDb from './test-db';
import * as testTg from './test-tg';

const fakeVatRequest1: PendingVatRequest = {
  telegramChatId: '123',
  countryCode: 'AA',
  vatNumber: '12345678',
  expirationDate: new Date(0)
};

const fakeVatRequest2: PendingVatRequest = {
  telegramChatId: '456',
  countryCode: 'BB',
  vatNumber: '87654321',
  expirationDate: new Date(0)
};

describe('HTTP Admin API Tests', () => {
  before(async () => {
    await testDb.init();
  });

  it('Unsupported action should result in 400', async () => {
    // Act.
    await httpAdminApi(testContext.context, {
      params: {
        action: 'unknown'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(400);
  });

  it(`'list' action should return a list of all VAT requests`, async () => {
    // Arrange.
    await db.addVatRequest(fakeVatRequest1, new Date(0));

    // Act.
    await httpAdminApi(testContext.context, {
      params: {
        action: 'list'
      }
    });

    // Assert.
    const vatNumbers = testContext.context.res?.body;
    expect(vatNumbers).to.eql([fakeVatRequest1]);
  });

  it(`'listErrors' action should return a list of all VAT request errors`, async () => {
    // Arrange.
    const error1 = await db.addVatRequestError(fakeVatRequest1, 'Oops1');

    // Act.
    await httpAdminApi(testContext.context, {
      params: {
        action: 'listErrors'
      }
    });

    // Assert.
    const vatRequestErrors = testContext.context.res?.body;
    expect(vatRequestErrors).to.eql([error1]);
  });

  it(`'resolveError' action should result in 400 if 'errorId' param is missing`, async () => {
    // Act.
    await httpAdminApi(testContext.context, {
      query: {},
      params: {
        action: 'resolveError'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(400);
    expect(testContext.context.res?.body).to.equal(
      'Missing VAT Request Error ID'
    );
  });

  it(`'resolveError' action should result in 404 if there is no such error`, async () => {
    // Act.
    await httpAdminApi(testContext.context, {
      query: {
        errorId: 'xxx'
      },
      params: {
        action: 'resolveError'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(404);
    expect(testContext.context.res?.body).to.equal(
      `VAT Request Error with id 'xxx' not found`
    );
  });

  it(`'resolveError' action should remove specific error from db`, async () => {
    // Arrange.
    const error1 = await db.addVatRequestError(fakeVatRequest1, 'Oops1');
    const error2 = await db.addVatRequestError(fakeVatRequest1, 'Oops2');

    // Act.
    await httpAdminApi(testContext.context, {
      query: {
        errorId: error1.id
      },
      params: {
        action: 'resolveError'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(204);
    const vatRequestErrors = await db.getAllVatRequestErrors();
    expect(vatRequestErrors).to.eql([error2]);
  });

  it(`'resolveError' action should add VAT Request back to db if all it's errors are resolved`, async () => {
    // Arrange.
    const error1 = await db.addVatRequestError(fakeVatRequest1, 'Oops1');
    const error2 = await db.addVatRequestError(fakeVatRequest1, 'Oops2');

    // Act.
    await httpAdminApi(testContext.context, {
      query: {
        errorId: error1.id,
        silent: true
      },
      params: {
        action: 'resolveError'
      }
    });

    await httpAdminApi(testContext.context, {
      query: {
        errorId: error2.id,
        silent: true
      },
      params: {
        action: 'resolveError'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(204);
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.eql([fakeVatRequest1]);
    const vatRequestErrors = await db.getAllVatRequestErrors();
    expect(vatRequestErrors).to.be.empty;
  });

  it(`'resolveError' action should not add VAT Request back to db if it's already there`, async () => {
    // Arrange.
    await db.addVatRequest(fakeVatRequest1, new Date(0));
    const error1 = await db.addVatRequestError(fakeVatRequest1, 'Oops1');

    // Act.
    await httpAdminApi(testContext.context, {
      query: {
        errorId: error1.id,
        silent: true
      },
      params: {
        action: 'resolveError'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(204);
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.eql([fakeVatRequest1]);
  });

  it(`'resolveError' action should notify Telegram user if all errors are resolved for the specific VAT Request`, async () => {
    // Arrange.
    const error1 = await db.addVatRequestError(fakeVatRequest1, 'Oops1');

    let telegramChatId = '';

    testTg.init((chatId) => {
      telegramChatId = chatId;
    });

    // Act.
    await httpAdminApi(testContext.context, {
      query: {
        errorId: error1.id
      },
      params: {
        action: 'resolveError'
      }
    });

    // Assert.
    expect(telegramChatId).to.be.equal(fakeVatRequest1.telegramChatId);
  });

  it(`'resolveAllErrors' action should remove all errors from db`, async () => {
    // Arrange.
    await db.addVatRequestError(fakeVatRequest1, 'Oops1');
    await db.addVatRequestError(fakeVatRequest1, 'Oops2');
    await db.addVatRequestError(fakeVatRequest2, 'Oops3');

    // Act.
    await httpAdminApi(testContext.context, {
      query: {
        silent: true
      },
      params: {
        action: 'resolveAllErrors'
      }
    });

    // Assert.
    const vatRequestErrors = await db.getAllVatRequestErrors();
    expect(vatRequestErrors).to.be.empty;
  });

  it(`'resolveAllErrors' should add faulted VAT Requests back to db`, async () => {
    // Arrange.
    await db.addVatRequestError(fakeVatRequest1, 'Oops1');
    await db.addVatRequestError(fakeVatRequest1, 'Oops2');
    await db.addVatRequestError(fakeVatRequest2, 'Oops3');

    // Act.
    await httpAdminApi(testContext.context, {
      query: {
        silent: true
      },
      params: {
        action: 'resolveAllErrors'
      }
    });

    // Assert.
    const vatRequests = await db.getAllVatRequests();
    expect(vatRequests).to.eql([fakeVatRequest1, fakeVatRequest2]);
  });

  it(`'removeError' action should result in 400 if 'errorId' param is missing`, async () => {
    // Act.
    await httpAdminApi(testContext.context, {
      query: {},
      params: {
        action: 'removeError'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(400);
    expect(testContext.context.res?.body).to.equal(
      'Missing VAT Request Error ID'
    );
  });

  it(`'removeError' action should result in 404 if there is no such error`, async () => {
    // Act.
    await httpAdminApi(testContext.context, {
      query: {
        errorId: 'xxx'
      },
      params: {
        action: 'removeError'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(404);
    expect(testContext.context.res?.body).to.equal(
      `VAT Request Error with id 'xxx' not found`
    );
  });

  it(`'removeError' action should remove specific error from db`, async () => {
    // Arrange.
    const error1 = await db.addVatRequestError(fakeVatRequest1, 'Oops1');
    const error2 = await db.addVatRequestError(fakeVatRequest1, 'Oops2');

    // Act.
    await httpAdminApi(testContext.context, {
      query: {
        errorId: error1.id
      },
      params: {
        action: 'removeError'
      }
    });

    // Assert.
    expect(testContext.context.res?.status).to.equal(204);
    const vatRequestErrors = await db.getAllVatRequestErrors();
    expect(vatRequestErrors).to.eql([error2]);
  });

  afterEach(async () => {
    testContext.tearDown();
    testTg.tearDown();
    await testDb.clear();
  });

  after(async () => {
    await testDb.tearDown();
  });
});
