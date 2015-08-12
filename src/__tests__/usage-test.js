// 80+ char lines are useful in describe/it, so ignore in this file.
/* eslint-disable max-len */

import { expect } from 'chai';
import { describe, it } from 'mocha';
import { stringify } from 'querystring';
import request from 'supertest-as-promised';
import koa from 'koa';
import Router from 'koa-router';
import graphqlHTTP from '..';


describe('Useful errors when incorrectly used', () => {

  it('requires an option factory function', () => {
    expect(() => {
      graphqlHTTP();
    }).to.throw(
      'GraphQL middleware requires options.'
    );
  });

  it('requires option factory function to return object', async () => {
    var app = koa();
    var router = new Router();

    var error;
    app.use(function *(next) {
      try {
        yield next;
      } catch (err) {
        error = err;
      }
      this.status = 200;
    });

    router.get('/graphql', graphqlHTTP(() => null));
    app.use(router.routes());

    await request(app.listen()).get('/graphql?' + stringify({ query: '{test}' }));
    expect(error.message).to.equal(
      'GraphQL middleware option function must return an options object.'
    );
  });

  it('requires option factory function to return object with schema', async () => {
    var app = koa();
    var router = new Router();

    var error;
    app.use(function *(next) {
      try {
        yield next;
      } catch (err) {
        error = err;
      }
      this.status = 200;
    });

    router.get('/graphql', graphqlHTTP(() => ({})));
    app.use(router.routes());

    await request(app.listen()).get('/graphql?' + stringify({ query: '{test}' }));
    expect(error.message).to.equal(
      'GraphQL middleware options must contain a schema.'
    );
  });

});
