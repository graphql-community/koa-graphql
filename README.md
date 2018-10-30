# GraphQL Koa Middleware

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david_img]][david_site]

Create a GraphQL HTTP server with [Koa](http://koajs.com/).

Port from [express-graphql](https://github.com/graphql/express-graphql)

## Installation

```
npm install --save koa-graphql
```

## Usage

Mount `koa-graphql` as a route handler:

```js
const Koa = require('koa');
const mount = require('koa-mount');
const graphqlHTTP = require('koa-graphql');

const app = new Koa();

app.use(mount('/graphql', graphqlHTTP({
  schema: MyGraphQLSchema,
  graphiql: true
})));

app.listen(4000);
```

With koa-router@7

```js
const Koa = require('koa');
const Router = require('koa-router'); // koa-router@7.x
const graphqlHTTP = require('koa-graphql');

const app = new Koa();
const router = new Router();

router.all('/graphql', graphqlHTTP({
  schema: MyGraphQLSchema,
  graphiql: true
}));

app.use(router.routes()).use(router.allowedMethods());
```

For Koa 1, use [koa-convert](https://github.com/koajs/convert) to convert the middleware:

```js
const koa = require('koa');
const mount = require('koa-mount'); // koa-mount@1.x
const convert = require('koa-convert');
const graphqlHTTP = require('koa-graphql');

const app = koa();

app.use(mount('/graphql', convert.back(graphqlHTTP({
  schema: MyGraphQLSchema,
  graphiql: true
}))));
```

> NOTE: Below is a copy from express-graphql's README. In this time I implemented almost same api, but it may be changed as time goes on.

## Options

The `graphqlHTTP` function accepts the following options:

  * **`schema`**: A `GraphQLSchema` instance from [`graphql-js`][].
    A `schema` *must* be provided.

  * **`graphiql`**: If `true`, presents [GraphiQL][] when the route with a
    `/graphiql` appended is loaded in a browser. We recommend that you set
    `graphiql` to `true` when your app is in development, because it's
    quite useful. You may or may not want it in production.

  * **`rootValue`**: A value to pass as the `rootValue` to the `graphql()`
    function from [`graphql-js/src/execute.js`](https://github.com/graphql/graphql-js/blob/master/src/execution/execute.js#L122).

  * **`context`**: A value to pass as the `context` to the `graphql()`
    function from [`graphql-js/src/execute.js`](https://github.com/graphql/graphql-js/blob/master/src/execution/execute.js#L123). If `context` is not provided, the
    `ctx` object is passed as the context.

  * **`pretty`**: If `true`, any JSON response will be pretty-printed.

  * **`formatError`**: An optional function which will be used to format any
    errors produced by fulfilling a GraphQL operation. If no function is
    provided, GraphQL's default spec-compliant [`formatError`][] function will be used.

  * **`extensions`**: An optional function for adding additional metadata to the
    GraphQL response as a key-value object. The result will be added to
    `"extensions"` field in the resulting JSON. This is often a useful place to
    add development time metadata such as the runtime of a query or the amount
    of resources consumed. This may be an async function. The function is
    given one object as an argument: `{ document, variables, operationName, result, context }`.

  * **`validationRules`**: Optional additional validation rules queries must
    satisfy in addition to those defined by the GraphQL spec.

  * **`fieldResolver`**


## HTTP Usage

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
involving uploading files. See an [example using multer](https://github.com/chentsulin/koa-graphql/blob/e1a98f3548203a3c41fedf3d4267846785480d28/src/__tests__/http-test.js#L664-L732).

If the POST body has not yet been parsed, koa-graphql will interpret it
depending on the provided *Content-Type* header.

  * **`application/json`**: the POST body will be parsed as a JSON
    object of parameters.

  * **`application/x-www-form-urlencoded`**: this POST body will be
    parsed as a url-encoded string of key-value pairs.

  * **`application/graphql`**: The POST body will be parsed as GraphQL
    query string, which provides the `query` parameter.

## Combining with Other koa Middleware

By default, the koa request is passed as the GraphQL `context`.
Since most koa middleware operates by adding extra data to the
request object, this means you can use most koa middleware just by inserting it before `graphqlHTTP` is mounted. This covers scenarios such as authenticating the user, handling file uploads, or mounting GraphQL on a dynamic endpoint.

This example uses [`koa-session`][] to provide GraphQL with the currently logged-in session.

```js
const Koa = require('koa');
const mount = require('koa-mount');
const session = require('koa-session');
const graphqlHTTP = require('koa-graphql');

const app = new Koa();
app.keys = [ 'some secret hurr' ];
app.use(session(app));
app.use(function *(next) {
  this.session.id = 'me';
  yield next;
});

app.use(mount('/graphql', graphqlHTTP({
  schema: MySessionAwareGraphQLSchema,
  graphiql: true
})));
```

Then in your type definitions, you can access the ctx via the third "context" argument in your `resolve` function:

```js
new GraphQLObjectType({
  name: 'MyType',
  fields: {
    myField: {
      type: GraphQLString,
      resolve(parentValue, args, ctx) {
        // use `ctx.session` here
      }
    }
  }
});
```


## Providing Extensions

The GraphQL response allows for adding additional information in a response to
a GraphQL query via a field in the response called `"extensions"`. This is added
by providing an `extensions` function when using `graphqlHTTP`. The function
must return a JSON-serializable Object.

When called, this is provided an argument which you can use to get information
about the GraphQL request:

`{ document, variables, operationName, result, context }`

This example illustrates adding the amount of time consumed by running the
provided query, which could perhaps be used by your development tools.

```js
const graphqlHTTP = require('koa-graphql');

const app = new Koa();

app.keys = [ 'some secret hurr' ];
app.use(session(app));

const extensions = ({ document, variables, operationName, result, context }) => {
  return {
    runTime: Date.now() - context.startTime,
  };
}

app.use(mount('/graphql', graphqlHTTP(request => {
  return {
    schema: MyGraphQLSchema,
    context: { startTime: Date.now() },
    graphiql: true,
    extensions,
  };
})));
```

When querying this endpoint, it would include this information in the result,
for example:

```js
{
  "data": { ... }
  "extensions": {
    "runTime": 135
  }
}
```


## Additional Validation Rules

GraphQL's [validation phase](https://facebook.github.io/graphql/#sec-Validation) checks the query to ensure that it can be successfully executed against the schema. The `validationRules` option allows for additional rules to be run during this phase. Rules are applied to each node in an AST representing the query using the Visitor pattern.

A validation rule is a function which returns a visitor for one or more node Types. Below is an example of a validation preventing the specific fieldname `metadata` from being queried. For more examples see the [`specifiedRules`](https://github.com/graphql/graphql-js/tree/master/src/validation/rules) in the [graphql-js](https://github.com/graphql/graphql-js) package.

```js
import { GraphQLError } from 'graphql';

export function DisallowMetadataQueries(context) {
  return {
    Field(node) {
      const fieldName = node.name.value;

      if (fieldName === "metadata") {
        context.reportError(
          new GraphQLError(
            `Validation: Requesting the field ${fieldName} is not allowed`,
          ),
        );
      }
    }
  };
}
```

## Debugging Tips

During development, it's useful to get more information from errors, such as
stack traces. Providing a function to `formatError` enables this:

```js
formatError: (error, ctx) => ({
  message: error.message,
  locations: error.locations,
  stack: error.stack ? error.stack.split('\n') : [],
  path: error.path
})
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
