/* @flow strict */

/* eslint-disable callback-return */

import { expect } from 'chai';
import { describe, it } from 'mocha';
import { stringify } from 'querystring';
import zlib from 'zlib';
import multer from 'multer';
import multerWrapper from './helpers/koa-multer';
import request from 'supertest';
import Koa from 'koa';
import mount from 'koa-mount';
import session from 'koa-session';
import parse from 'co-body';
import getRawBody from 'raw-body';

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLString,
  GraphQLError,
  BREAK,
} from 'graphql';
import graphqlHTTP from '../';

const QueryRootType = new GraphQLObjectType({
  name: 'QueryRoot',
  fields: {
    test: {
      type: GraphQLString,
      args: {
        who: {
          type: GraphQLString,
        },
      },
      resolve: (root, { who }) => 'Hello ' + ((who: any) || 'World'),
    },
    nonNullThrower: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: () => {
        throw new Error('Throws!');
      },
    },
    thrower: {
      type: GraphQLString,
      resolve: () => {
        throw new Error('Throws!');
      },
    },
    context: {
      type: GraphQLString,
      resolve: (obj, args, context) => context,
    },
    contextDotFoo: {
      type: GraphQLString,
      resolve: (obj, args, context) => {
        return (context: any).foo;
      },
    },
    missingResolver: {
      type: GraphQLString,
    },
  },
});

const TestSchema = new GraphQLSchema({
  query: QueryRootType,
  mutation: new GraphQLObjectType({
    name: 'MutationRoot',
    fields: {
      writeTest: {
        type: QueryRootType,
        resolve: () => ({}),
      },
    },
  }),
});

function urlString(urlParams?: ?{ [param: string]: mixed }) {
  let string = '/graphql';
  if (urlParams) {
    string += '?' + stringify(urlParams);
  }
  return string;
}

function promiseTo(fn) {
  return new Promise((resolve, reject) => {
    fn((error, result) => (error ? reject(error) : resolve(result)));
  });
}

describe('test harness', () => {
  it('resolves callback promises', async () => {
    const resolveValue = {};
    const result = await promiseTo(cb => cb(null, resolveValue));
    expect(result).to.equal(resolveValue);
  });

  it('rejects callback promises with errors', async () => {
    const rejectError = new Error();
    let caught;
    try {
      await promiseTo(cb => cb(rejectError));
    } catch (error) {
      caught = error;
    }
    expect(caught).to.equal(rejectError);
  });
});

function server() {
  const app = new Koa();
  app.on('error', error => {
    // eslint-disable-next-line no-console
    console.log('App encountered an error:', error);
  });
  return app;
}

describe('GraphQL-HTTP tests', () => {
  describe('GET functionality', () => {
    it('allows GET with query param', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{test}',
        }),
      );

      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');
    });

    it('allows GET with variable values', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: 'query helloWho($who: String){ test(who: $who) }',
          variables: JSON.stringify({ who: 'Dolly' }),
        }),
      );

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('allows GET with operation name', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: `
            query helloYou { test(who: "You"), ...shared }
            query helloWorld { test(who: "World"), ...shared }
            query helloDolly { test(who: "Dolly"), ...shared }
            fragment shared on QueryRoot {
              shared: test(who: "Everyone")
            }
          `,
          operationName: 'helloWorld',
        }),
      );

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
          shared: 'Hello Everyone',
        },
      });
    });

    it('Reports validation errors', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen()).get(
        urlString({
          query: '{ test, unknownOne, unknownTwo }',
        }),
      );

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [
          {
            message: 'Cannot query field "unknownOne" on type "QueryRoot".',
            locations: [{ line: 1, column: 9 }],
          },
          {
            message: 'Cannot query field "unknownTwo" on type "QueryRoot".',
            locations: [{ line: 1, column: 21 }],
          },
        ],
      });
    });

    it('Errors when missing operation name', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen()).get(
        urlString({
          query: `
            query TestQuery { test }
            mutation TestMutation { writeTest { test } }
          `,
        }),
      );

      expect(response.status).to.equal(500);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [
          {
            message:
              'Must provide operation name if query contains multiple operations.',
          },
        ],
      });
    });

    it('Errors when sending a mutation via GET', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen()).get(
        urlString({
          query: 'mutation TestMutation { writeTest { test } }',
        }),
      );

      expect(response.status).to.equal(405);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [
          {
            message:
              'Can only perform a mutation operation from a POST request.',
          },
        ],
      });
    });

    it('Errors when selecting a mutation within a GET', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen()).get(
        urlString({
          operationName: 'TestMutation',
          query: `
            query TestQuery { test }
            mutation TestMutation { writeTest { test } }
          `,
        }),
      );

      expect(response.status).to.equal(405);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [
          {
            message:
              'Can only perform a mutation operation from a POST request.',
          },
        ],
      });
    });

    it('Allows a mutation to exist within a GET', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen()).get(
        urlString({
          operationName: 'TestQuery',
          query: `
            mutation TestMutation { writeTest { test } }
            query TestQuery { test }
          `,
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
        },
      });
    });

    it('Allows passing in a context', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            context: 'testValue',
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          operationName: 'TestQuery',
          query: `
            query TestQuery { context }
          `,
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          context: 'testValue',
        },
      });
    });

    it('Allows passing in a fieldResolver', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            context: 'testValue',
            fieldResolver() {
              return 'fieldResolver data';
            },
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          operationName: 'TestQuery',
          query: `
            query TestQuery { missingResolver }
          `,
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          missingResolver: 'fieldResolver data',
        },
      });
    });

    it('Uses ctx as context by default', async () => {
      const app = server();

      // Middleware that adds ctx.foo to every request
      app.use((ctx, next) => {
        ctx.foo = 'bar';
        return next();
      });

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          operationName: 'TestQuery',
          query: `
            query TestQuery { contextDotFoo }
          `,
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          contextDotFoo: 'bar',
        },
      });
    });

    it('Allows returning an options Promise', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP(() =>
            Promise.resolve({
              schema: TestSchema,
            }),
          ),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{test}',
        }),
      );

      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');
    });

    it('Catches errors thrown from options function', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP(() => {
            throw new Error('I did something wrong');
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{test}',
        }),
      );

      expect(response.status).to.equal(500);
      expect(response.text).to.equal(
        '{"errors":[{"message":"I did something wrong"}]}',
      );
    });
  });

  describe('POST functionality', () => {
    it('allows POST with JSON encoding', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send({ query: '{test}' });

      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');
    });

    it('Allows sending a mutation via POST', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen())
        .post(urlString())
        .send({ query: 'mutation TestMutation { writeTest { test } }' });

      expect(response.status).to.equal(200);
      expect(response.text).to.equal(
        '{"data":{"writeTest":{"test":"Hello World"}}}',
      );
    });

    it('allows POST with url encoding', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send(stringify({ query: '{test}' }));

      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');
    });

    it('supports POST JSON query with string variables', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send({
          query: 'query helloWho($who: String){ test(who: $who) }',
          variables: JSON.stringify({ who: 'Dolly' }),
        });

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('supports POST JSON query with JSON variables', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send({
          query: 'query helloWho($who: String){ test(who: $who) }',
          variables: { who: 'Dolly' },
        });

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('supports POST url encoded query with string variables', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send(
          stringify({
            query: 'query helloWho($who: String){ test(who: $who) }',
            variables: JSON.stringify({ who: 'Dolly' }),
          }),
        );

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('supports POST JSON query with GET variable values', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(
          urlString({
            variables: JSON.stringify({ who: 'Dolly' }),
          }),
        )
        .send({ query: 'query helloWho($who: String){ test(who: $who) }' });

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('supports POST url encoded query with GET variable values', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(
          urlString({
            variables: JSON.stringify({ who: 'Dolly' }),
          }),
        )
        .send(
          stringify({
            query: 'query helloWho($who: String){ test(who: $who) }',
          }),
        );

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('supports POST raw text query with GET variable values', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(
          urlString({
            variables: JSON.stringify({ who: 'Dolly' }),
          }),
        )
        .set('Content-Type', 'application/graphql')
        .send('query helloWho($who: String){ test(who: $who) }');

      expect(response.text).to.equal('{"data":{"test":"Hello Dolly"}}');
    });

    it('allows POST with operation name', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send({
          query: `
            query helloYou { test(who: "You"), ...shared }
            query helloWorld { test(who: "World"), ...shared }
            query helloDolly { test(who: "Dolly"), ...shared }
            fragment shared on QueryRoot {
              shared: test(who: "Everyone")
            }
          `,
          operationName: 'helloWorld',
        });

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
          shared: 'Hello Everyone',
        },
      });
    });

    it('allows POST with GET operation name', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(
          urlString({
            operationName: 'helloWorld',
          }),
        )
        .set('Content-Type', 'application/graphql').send(`
          query helloYou { test(who: "You"), ...shared }
          query helloWorld { test(who: "World"), ...shared }
          query helloDolly { test(who: "Dolly"), ...shared }
          fragment shared on QueryRoot {
            shared: test(who: "Everyone")
          }
        `);

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
          shared: 'Hello Everyone',
        },
      });
    });

    it('allows other UTF charsets', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const req = request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/graphql; charset=utf-16');
      req.write(new Buffer('{ test(who: "World") }', 'utf16le'));
      const response = await req;

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
        },
      });
    });

    it('allows gzipped POST bodies', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const data = { query: '{ test(who: "World") }' };
      const json = JSON.stringify(data);
      const gzippedJson = await promiseTo(cb => zlib.gzip(json, cb));

      const req = request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'gzip');
      req.write(gzippedJson);
      const response = await req;

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
        },
      });
    });

    it('allows deflated POST bodies', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const data = { query: '{ test(who: "World") }' };
      const json = JSON.stringify(data);
      const deflatedJson = await promiseTo(cb => zlib.deflate(json, cb));

      const req = request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'deflate');
      req.write(deflatedJson);
      const response = await req;

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
        },
      });
    });

    // should replace multer with koa middleware
    it('allows for pre-parsed POST bodies', async () => {
      // Note: this is not the only way to handle file uploads with GraphQL,
      // but it is terse and illustrative of using koa-graphql and multer
      // together.

      // A simple schema which includes a mutation.
      const UploadedFileType = new GraphQLObjectType({
        name: 'UploadedFile',
        fields: {
          originalname: { type: GraphQLString },
          mimetype: { type: GraphQLString },
        },
      });

      const TestMutationSchema = new GraphQLSchema({
        query: new GraphQLObjectType({
          name: 'QueryRoot',
          fields: {
            test: { type: GraphQLString },
          },
        }),
        mutation: new GraphQLObjectType({
          name: 'MutationRoot',
          fields: {
            uploadFile: {
              type: UploadedFileType,
              resolve(rootValue) {
                // For this test demo, we're just returning the uploaded
                // file directly, but presumably you might return a Promise
                // to go store the file somewhere first.
                return rootValue.request.file;
              },
            },
          },
        }),
      });

      const app = server();

      // Multer provides multipart form data parsing.
      const storage = multer.memoryStorage();
      app.use(mount(urlString(), multerWrapper({ storage }).single('file')));

      // Providing the request as part of `rootValue` allows it to
      // be accessible from within Schema resolve functions.
      app.use(
        mount(
          urlString(),
          graphqlHTTP((req, ctx) => {
            expect(ctx.req.file.originalname).to.equal('http-test.js');
            return {
              schema: TestMutationSchema,
              rootValue: { request: ctx.req },
            };
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .field(
          'query',
          `mutation TestMutation {
          uploadFile { originalname, mimetype }
        }`,
        )
        .attach('file', __filename);

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          uploadFile: {
            originalname: 'http-test.js',
            mimetype: 'application/javascript',
          },
        },
      });
    });

    it('allows for pre-parsed POST using application/graphql', async () => {
      const app = server();
      app.use(async function(ctx, next) {
        if (ctx.is('application/graphql')) {
          ctx.request.body = await parse.text(ctx);
        }
        await next();
      });

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const req = request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/graphql');
      req.write(new Buffer('{ test(who: "World") }'));
      const response = await req;

      expect(JSON.parse(response.text)).to.deep.equal({
        data: {
          test: 'Hello World',
        },
      });
    });

    it('does not accept unknown pre-parsed POST string', async () => {
      const app = server();
      app.use(async function(ctx, next) {
        if (ctx.is('*/*')) {
          ctx.request.body = await parse.text(ctx);
        }
        await next();
      });

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const req = request(app.listen()).post(urlString());
      req.write(new Buffer('{ test(who: "World") }'));
      const response = await req;

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'Must provide query string.' }],
      });
    });

    it('does not accept unknown pre-parsed POST raw Buffer', async () => {
      const app = server();
      app.use(async function(ctx, next) {
        if (ctx.is('*/*')) {
          const req = ctx.req;
          ctx.request.body = await getRawBody(req, {
            length: req.headers['content-length'],
            limit: '1mb',
            encoding: null,
          });
        }
        await next();
      });

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const req = request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/graphql');
      req.write(new Buffer('{ test(who: "World") }'));
      const response = await req;

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'Must provide query string.' }],
      });
    });
  });

  describe('Pretty printing', () => {
    it('supports pretty printing', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            pretty: true,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{test}',
        }),
      );

      expect(response.text).to.equal(
        '{\n' + '  "data": {\n' + '    "test": "Hello World"\n' + '  }\n' + '}',
      );
    });

    it('supports pretty printing configured by request', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP(req => {
            return {
              schema: TestSchema,
              pretty: req.query.pretty === '1',
            };
          }),
        ),
      );

      const defaultResponse = await request(app.listen()).get(
        urlString({
          query: '{test}',
        }),
      );

      expect(defaultResponse.text).to.equal('{"data":{"test":"Hello World"}}');

      const prettyResponse = await request(app.listen()).get(
        urlString({
          query: '{test}',
          pretty: 1,
        }),
      );

      expect(prettyResponse.text).to.equal(
        '{\n' + '  "data": {\n' + '    "test": "Hello World"\n' + '  }\n' + '}',
      );

      const unprettyResponse = await request(app.listen()).get(
        urlString({
          query: '{test}',
          pretty: 0,
        }),
      );

      expect(unprettyResponse.text).to.equal('{"data":{"test":"Hello World"}}');
    });
  });

  it('will send request, response and context when using thunk', async () => {
    const app = server();

    let hasRequest = false;
    let hasResponse = false;
    let hasContext = false;

    app.use(
      mount(
        urlString(),
        graphqlHTTP((reqest, response, context) => {
          if (request) {
            hasRequest = true;
          }
          if (response) {
            hasResponse = true;
          }
          if (context) {
            hasContext = true;
          }
          return { schema: TestSchema };
        }),
      ),
    );

    await request(app.listen()).get(urlString({ query: '{test}' }));

    expect(hasRequest).to.equal(true);
    expect(hasResponse).to.equal(true);
    expect(hasContext).to.equal(true);
  });

  describe('Error handling functionality', () => {
    it('handles field errors caught by GraphQL', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{thrower}',
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: { thrower: null },
        errors: [
          {
            message: 'Throws!',
            locations: [{ line: 1, column: 2 }],
            path: ['thrower'],
          },
        ],
      });
    });

    it('handles query errors from non-null top field errors', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{nonNullThrower}',
        }),
      );

      expect(response.status).to.equal(500);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: null,
        errors: [
          {
            message: 'Throws!',
            locations: [{ line: 1, column: 2 }],
            path: ['nonNullThrower'],
          },
        ],
      });
    });

    it('allows for custom error formatting to sanitize', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            formatError(error) {
              return { message: 'Custom error format: ' + error.message };
            },
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{thrower}',
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: { thrower: null },
        errors: [
          {
            message: 'Custom error format: Throws!',
          },
        ],
      });
    });

    it('allows for custom error formatting to elaborate', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            formatError(error) {
              return {
                message: error.message,
                locations: error.locations,
                stack: 'Stack trace',
              };
            },
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{thrower}',
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: { thrower: null },
        errors: [
          {
            message: 'Throws!',
            locations: [{ line: 1, column: 2 }],
            stack: 'Stack trace',
          },
        ],
      });
    });

    it('handles syntax errors caught by GraphQL', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: 'syntaxerror',
        }),
      );

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [
          {
            message: 'Syntax Error: Unexpected Name "syntaxerror"',
            locations: [{ line: 1, column: 1 }],
          },
        ],
      });
    });

    it('handles errors caused by a lack of query', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).get(urlString());

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'Must provide query string.' }],
      });
    });

    it('handles invalid JSON bodies', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/json')
        .send('[]');

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'POST body sent invalid JSON.' }],
      });
    });

    it('handles incomplete JSON bodies', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/json')
        .send('{"query":');

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'POST body sent invalid JSON.' }],
      });
    });

    it('handles plain POST text', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(
          urlString({
            variables: JSON.stringify({ who: 'Dolly' }),
          }),
        )
        .set('Content-Type', 'text/plain')
        .send('query helloWho($who: String){ test(who: $who) }');

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'Must provide query string.' }],
      });
    });

    it('handles unsupported charset', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/graphql; charset=ascii')
        .send('{ test(who: "World") }');

      expect(response.status).to.equal(415);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'Unsupported charset "ASCII".' }],
      });
    });

    it('handles unsupported utf charset', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .set('Content-Type', 'application/graphql; charset=utf-53')
        .send('{ test(who: "World") }');

      expect(response.status).to.equal(415);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'Unsupported charset "UTF-53".' }],
      });
    });

    it('handles unknown encoding', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .set('Content-Encoding', 'garbage')
        .send('!@#$%^*(&^$%#@');

      expect(response.status).to.equal(415);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'Unsupported content-encoding "garbage".' }],
      });
    });

    it('handles poorly formed variables', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          variables: 'who:You',
          query: 'query helloWho($who: String){ test(who: $who) }',
        }),
      );

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'Variables are invalid JSON.' }],
      });
    });

    it('allows for custom error formatting of poorly formed requests', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            formatError(error) {
              return { message: 'Custom error format: ' + error.message };
            },
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          variables: 'who:You',
          query: 'query helloWho($who: String){ test(who: $who) }',
        }),
      );

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [
          {
            message: 'Custom error format: Variables are invalid JSON.',
          },
        ],
      });
    });

    it('handles invalid variables', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen())
        .post(urlString())
        .send({
          query: 'query helloWho($who: String){ test(who: $who) }',
          variables: { who: ['Dolly', 'Jonty'] },
        });

      expect(response.status).to.equal(500);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [
          {
            locations: [{ column: 16, line: 1 }],
            message:
              'Variable "$who" got invalid value ["Dolly", "Jonty"]; Expected type String; String cannot represent a non string value: ["Dolly", "Jonty"]',
          },
        ],
      });
    });

    it('handles unsupported HTTP methods', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
          }),
        ),
      );

      const response = await request(app.listen()).put(
        urlString({ query: '{test}' }),
      );

      expect(response.status).to.equal(405);
      expect(response.headers.allow).to.equal('GET, POST');
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [{ message: 'GraphQL only supports GET and POST requests.' }],
      });
    });
  });

  describe('Built-in GraphiQL support', () => {
    it('does not renders GraphiQL if no opt-in', async () => {
      const app = server();

      app.use(mount(urlString(), graphqlHTTP({ schema: TestSchema })));

      const response = await request(app.listen())
        .get(urlString({ query: '{test}' }))
        .set('Accept', 'text/html');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('application/json');
      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');
    });

    it('presents GraphiQL when accepting HTML', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            graphiql: true,
          }),
        ),
      );

      const response = await request(app.listen())
        .get(urlString({ query: '{test}' }))
        .set('Accept', 'text/html');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('text/html');
      expect(response.text).to.include('graphiql.min.js');
    });

    it('contains a pre-run response within GraphiQL', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            graphiql: true,
          }),
        ),
      );

      const response = await request(app.listen())
        .get(urlString({ query: '{test}' }))
        .set('Accept', 'text/html');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('text/html');
      expect(response.text).to.include(
        'response: ' +
          JSON.stringify(
            JSON.stringify({ data: { test: 'Hello World' } }, null, 2),
          ),
      );
    });

    it('contains a pre-run operation name within GraphiQL', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            graphiql: true,
          }),
        ),
      );

      const response = await request(app.listen())
        .get(
          urlString({
            query: 'query A{a:test} query B{b:test}',
            operationName: 'B',
          }),
        )
        .set('Accept', 'text/html');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('text/html');
      expect(response.text).to.include(
        'response: ' +
          JSON.stringify(
            JSON.stringify({ data: { b: 'Hello World' } }, null, 2),
          ),
      );
      expect(response.text).to.include('operationName: "B"');
    });

    it('escapes HTML in queries within GraphiQL', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            graphiql: true,
          }),
        ),
      );

      const response = await request(app.listen())
        .get(urlString({ query: '</script><script>alert(1)</script>' }))
        .set('Accept', 'text/html');

      expect(response.status).to.equal(400);
      expect(response.type).to.equal('text/html');
      expect(response.text).to.not.include(
        '</script><script>alert(1)</script>',
      );
    });

    it('escapes HTML in variables within GraphiQL', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            graphiql: true,
          }),
        ),
      );

      const response = await request(app.listen())
        .get(
          urlString({
            query: 'query helloWho($who: String) { test(who: $who) }',
            variables: JSON.stringify({
              who: '</script><script>alert(1)</script>',
            }),
          }),
        )
        .set('Accept', 'text/html');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('text/html');
      expect(response.text).to.not.include(
        '</script><script>alert(1)</script>',
      );
    });

    it('GraphiQL renders provided variables', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            graphiql: true,
          }),
        ),
      );

      const response = await request(app.listen())
        .get(
          urlString({
            query: 'query helloWho($who: String) { test(who: $who) }',
            variables: JSON.stringify({ who: 'Dolly' }),
          }),
        )
        .set('Accept', 'text/html');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('text/html');
      expect(response.text).to.include(
        'variables: ' +
          JSON.stringify(JSON.stringify({ who: 'Dolly' }, null, 2)),
      );
    });

    it('GraphiQL accepts an empty query', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            graphiql: true,
          }),
        ),
      );

      const response = await request(app.listen())
        .get(urlString())
        .set('Accept', 'text/html');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('text/html');
      expect(response.text).to.include('response: undefined');
    });

    it('GraphiQL accepts a mutation query - does not execute it', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            graphiql: true,
          }),
        ),
      );

      const response = await request(app.listen())
        .get(
          urlString({
            query: 'mutation TestMutation { writeTest { test } }',
          }),
        )
        .set('Accept', 'text/html');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('text/html');
      expect(response.text).to.include(
        'query: "mutation TestMutation { writeTest { test } }"',
      );
      expect(response.text).to.include('response: undefined');
    });

    it('returns HTML if preferred', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            graphiql: true,
          }),
        ),
      );

      const response = await request(app.listen())
        .get(urlString({ query: '{test}' }))
        .set('Accept', 'text/html,application/json');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('text/html');
      expect(response.text).to.include('{test}');
      expect(response.text).to.include('graphiql.min.js');
    });

    it('returns JSON if preferred', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            graphiql: true,
          }),
        ),
      );

      const response = await request(app.listen())
        .get(urlString({ query: '{test}' }))
        .set('Accept', 'application/json,text/html');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('application/json');
      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');
    });

    it('prefers JSON if unknown accept', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            graphiql: true,
          }),
        ),
      );

      const response = await request(app.listen())
        .get(urlString({ query: '{test}' }))
        .set('Accept', 'unknown');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('application/json');
      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');
    });

    it('prefers JSON if explicitly requested raw response', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            graphiql: true,
          }),
        ),
      );

      const response = await request(app.listen())
        .get(urlString({ query: '{test}', raw: '' }))
        .set('Accept', 'text/html');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('application/json');
      expect(response.text).to.equal('{"data":{"test":"Hello World"}}');
    });
  });

  describe('Custom validation rules', () => {
    const AlwaysInvalidRule = function(context) {
      return {
        enter() {
          context.reportError(
            new GraphQLError('AlwaysInvalidRule was really invalid!'),
          );
          return BREAK;
        },
      };
    };

    it('Do not execute a query if it do not pass the custom validation.', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            validationRules: [AlwaysInvalidRule],
            pretty: true,
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{thrower}',
        }),
      );

      expect(response.status).to.equal(400);
      expect(JSON.parse(response.text)).to.deep.equal({
        errors: [
          {
            message: 'AlwaysInvalidRule was really invalid!',
          },
        ],
      });
    });
  });

  describe('Session support', () => {
    it('supports koa-session', async () => {
      const SessionAwareGraphQLSchema = new GraphQLSchema({
        query: new GraphQLObjectType({
          name: 'MyType',
          fields: {
            myField: {
              type: GraphQLString,
              resolve(parentValue, _, sess) {
                return (sess: any).id;
              },
            },
          },
        }),
      });
      const app = server();
      app.keys = ['some secret hurr'];
      app.use(session(app));
      app.use(async function(ctx, next) {
        ctx.session.id = 'me';
        await next();
      });

      app.use(
        mount(
          '/graphql',
          graphqlHTTP((req, res, ctx) => ({
            schema: SessionAwareGraphQLSchema,
            context: (ctx: any).session,
          })),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{myField}',
        }),
      );

      expect(response.text).to.equal('{"data":{"myField":"me"}}');
    });
  });

  describe('Custom result extensions', () => {
    it('allows for adding extensions', async () => {
      const app = server();

      const extensions = ({ context = {} }) => {
        if (context !== null && typeof context.startTime === 'number') {
          return {
            runTime: 1000000010 /* Date.now() */ - context.startTime,
          };
        }
        return {};
      };

      app.use(
        mount(
          urlString(),
          graphqlHTTP(() => {
            return {
              schema: TestSchema,
              context: { startTime: 1000000000 },
              extensions,
            };
          }),
        ),
      );

      const response = await request(app.listen())
        .get(urlString({ query: '{test}', raw: '' }))
        .set('Accept', 'text/html');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('application/json');
      expect(response.text).to.equal(
        '{"data":{"test":"Hello World"},"extensions":{"runTime":10}}',
      );
    });

    it('extensions have access to initial GraphQL result', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            formatError: () => null,
            extensions({ result }) {
              return { preservedErrors: (result: any).errors };
            },
          }),
        ),
      );

      const response = await request(app.listen()).get(
        urlString({
          query: '{thrower}',
        }),
      );

      expect(response.status).to.equal(200);
      expect(JSON.parse(response.text)).to.deep.equal({
        data: { thrower: null },
        errors: [null],
        extensions: {
          preservedErrors: [
            {
              message: 'Throws!',
              locations: [{ line: 1, column: 2 }],
              path: ['thrower'],
            },
          ],
        },
      });
    });

    it('extension function may be async', async () => {
      const app = server();

      app.use(
        mount(
          urlString(),
          graphqlHTTP({
            schema: TestSchema,
            async extensions() {
              // Note: you can await arbitrary things here!
              return { eventually: 42 };
            },
          }),
        ),
      );

      const response = await request(app.listen())
        .get(urlString({ query: '{test}', raw: '' }))
        .set('Accept', 'text/html');

      expect(response.status).to.equal(200);
      expect(response.type).to.equal('application/json');
      expect(response.text).to.equal(
        '{"data":{"test":"Hello World"},"extensions":{"eventually":42}}',
      );
    });
  });
});
