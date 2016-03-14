# GraphQL Koa Middleware

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david_img]][david_site]

Create a GraphQL HTTP server with [Koa](http://koajs.com/).

Port from [express-graphql](https://github.com/graphql/express-graphql)

## Install

```
npm install --save koa-graphql
```

## Usage

```js
var koa = require('koa');
var mount = require('koa-mount');
var graphqlHTTP = require('koa-graphql');

var app = koa();

app.use(mount('/graphql', graphqlHTTP({ schema: MyGraphQLSchema, graphiql: true })));
```

> NOTE: Below is a copy from express-graphql's README. In this time I implemented almost same api, but it may be changed as time goes on.

### Options

The `graphqlHTTP` function accepts the following options:

  * **`schema`**: A `GraphQLSchema` instance from [`graphql-js`][].
    A `schema` *must* be provided.

  * **`rootValue`**: A value to pass as the rootValue to the `graphql()`
    function from [`graphql-js`][].

  * **`pretty`**: If `true`, any JSON response will be pretty-printed.

  * **`formatError`**: An optional function which will be used to format any
    errors produced by fulfilling a GraphQL operation. If no function is
    provided, GraphQL's default spec-compliant [`formatError`][] function will
    be used.

  * **`validationRules`**: Optional additional validation rules queries must
    satisfy in addition to those defined by the GraphQL spec.

  * **`graphiql`**: If `true`, may present [GraphiQL][] when loaded directly
    from a browser (a useful tool for debugging and exploration).

#### Debugging

During development, it's useful to get more information from errors, such as
stack traces. Providing a function to `formatError` enables this:

```js
formatError: error => ({
  message: error.message,
  locations: error.locations,
  stack: error.stack
})
```


### HTTP Usage

Once installed at a path, `koa-graphql` will accept requests with
the parameters:

  * **`query`**: A string GraphQL document to be executed.

  * **`variables`**: The runtime values to use for any GraphQL query variables
    as a JSON object.

  * **`operationName`**: If the provided `query` contains multiple named
    operations, this specifies which operation should be executed. If not
    provided, a 400 error will be returned if the `query` contains multiple
    named operations.

  * **`raw`**: If the `graphiql` option is enabled and the `raw` parameter is
    provided raw JSON will always be returned instead of GraphiQL even when
    loaded from a browser.

GraphQL will first look for each parameter in the URL's query-string:

```
/graphql?query=query+getUser($id:ID){user(id:$id){name}}&variables={"id":"4"}
```

If not found in the query-string, it will look in the POST request body.

If a previous middleware has already parsed the POST body, the `request.body`
value will be used. Use [`multer`][] or a similar middleware to add support
for `multipart/form-data` content, which may be useful for GraphQL mutations
involving uploading files. See an [example using multer](https://github.com/chentsulin/koa-graphql/blob/master/src/__tests__/http-test.js#L599).

If the POST body has not yet been parsed, graphql-express will interpret it
depending on the provided *Content-Type* header.

  * **`application/json`**: the POST body will be parsed as a JSON
    object of parameters.

  * **`application/x-www-form-urlencoded`**: this POST body will be
    parsed as a url-encoded string of key-value pairs.

  * **`application/graphql`**: The POST body will be parsed as GraphQL
    query string, which provides the `query` parameter.

### Advanced Options

In order to support advanced scenarios such as installing a GraphQL server on a
dynamic endpoint or accessing the current authentication information,
koa-graphql allows options to be provided as a function of each
koa request.

This example uses [`koa-session`][] to run GraphQL on a rootValue based on
the currently logged-in session.

```js
var koa = require('koa');
var mount = require('koa-mount');
var session = require('koa-session');
var graphqlHTTP = require('koa-graphql');

var app = koa();
app.keys = [ 'some secret hurr' ];
app.use(session(app));
app.use(function *(next) {
  this.session.id = 'me';
  yield next;
});

app.use(mount('/graphql', graphqlHTTP((request, context) => ({
  schema: MySessionAwareGraphQLSchema,
  rootValue: { session: context.session },
  graphiql: true
}))));
```

Then in your type definitions, access `session` from the rootValue:

```js
new GraphQLObjectType({
  name: 'MyType',
  fields: {
    myField: {
      type: GraphQLString,
      resolve(parentValue, _, { rootValue: { session } }) {
        // use `session` here
      }
    }
  }
});
```

### Examples

- [koa-graphql-relay-example](https://github.com/chentsulin/koa-graphql-relay-example)
- [tests](https://github.com/chentsulin/koa-graphql/blob/master/src/__tests__/http-test.js)

### Other relevant projects

Please checkout [awesome-graphql](https://github.com/chentsulin/awesome-graphql).

### Contributing

Welcome pull requests!

### License

BSD-3-Clause

[`graphql-js`]: https://github.com/graphql/graphql-js
[`formatError`]: https://github.com/graphql/graphql-js/blob/master/src/error/formatError.js
[GraphiQL]: https://github.com/graphql/graphiql
[`multer`]: https://github.com/expressjs/multer
[`koa-session`]: https://github.com/koajs/session
[npm-image]: https://img.shields.io/npm/v/koa-graphql.svg?style=flat-square
[npm-url]: https://npmjs.org/package/koa-graphql
[travis-image]: https://travis-ci.org/chentsulin/koa-graphql.svg?branch=master
[travis-url]: https://travis-ci.org/chentsulin/koa-graphql
[coveralls-image]: https://coveralls.io/repos/chentsulin/koa-graphql/badge.svg?branch=master&service=github
[coveralls-url]: https://coveralls.io/github/chentsulin/koa-graphql?branch=master
[david_img]: https://david-dm.org/chentsulin/koa-graphql.svg
[david_site]: https://david-dm.org/chentsulin/koa-graphql
