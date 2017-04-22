// 80+ char lines are useful in describe/it, so ignore in this file.
/* eslint-disable max-len */

import { expect } from 'chai';
import { describe, it } from 'mocha';
import request from 'supertest-as-promised';
import Koa from 'koa';
import mount from 'koa-mount';
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
    const app = new Koa();

    app.use(mount('/graphql', graphqlHTTP(() => null)));

    const response = await request(app.listen()).get('/graphql?query={test}');

    expect(response.status).to.equal(500);
    expect(JSON.parse(response.text)).to.deep.equal({
      errors: [
        { message:
          'GraphQL middleware option function must return an options object or a promise which will be resolved to an options object.' }
      ]
    });
  });

  it('requires option factory function to return object or promise of object', async () => {
    const app = new Koa();

    app.use(mount('/graphql', graphqlHTTP(() => Promise.resolve(null))));

    const response = await request(app.listen()).get('/graphql?query={test}');

    expect(response.status).to.equal(500);
    expect(JSON.parse(response.text)).to.deep.equal({
      errors: [
        { message:
          'GraphQL middleware option function must return an options object or a promise which will be resolved to an options object.' }
      ]
    });
  });

  it('requires option factory function to return object with schema', async () => {
    const app = new Koa();

    app.use(mount('/graphql', graphqlHTTP(() => ({}))));


    const response = await request(app.listen()).get('/graphql?query={test}');

    expect(response.status).to.equal(500);
    expect(JSON.parse(response.text)).to.deep.equal({
      errors: [
        { message: 'GraphQL middleware options must contain a schema.' }
      ]
    });
  });

  it('requires option factory function to return object or promise of object with schema', async () => {
    const app = new Koa();

    app.use(mount('/graphql', graphqlHTTP(() => Promise.resolve({}))));

    const response = await request(app.listen()).get('/graphql?query={test}');

    expect(response.status).to.equal(500);
    expect(JSON.parse(response.text)).to.deep.equal({
      errors: [
        { message: 'GraphQL middleware options must contain a schema.' }
      ]
    });
  });

});
