# GraphQL Koa Middleware

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david_img]][david_site]

Create a GraphQL HTTP server with [Koa](http://koajs.com/).

Port from [express-graphql](https://github.com/graphql/express-graphql)

## Install

```
npm install --save koa-gql
```

> NOTE: `koa-graphql` has been used by other developer. So use `koa-gql` instead.

## Usage

```js
var koa = require('koa');
var mount = require('koa-mount');
var graphqlHTTP = require('koa-gql');

var app = koa();

app.use(mount('/graphql', graphqlHTTP({ schema: MyGraphQLSchema })));
```

> NOTE: Below is a copy from express-graphql's README. In this time I implemented almost same api, but it may be changed as time goes on.

### HTTP Usage

Once installed at a path, `express-graphql` will accept requests with
the parameters:

  * **`query`**: A string GraphQL document to be executed.

  * **`variables`**: The runtime values to use for any GraphQL query variables
    as a JSON object.

  * **`operationName`**: If the provided `query` contains multiple named
    operations, this specifies which operation should be executed. If not
    provided, an 400 error will be returned if the `query` contains multiple
    named operations.

GraphQL will first look for each parameter in the URL's query-string:

```
/graphql?query=query+getUser($id:ID){user(id:$id){name}}&variables={"id":"4"}
```

If not found in the query-string, it will look in the POST request body.

If a previous middleware has already parsed the POST body, the `request.body`
value will be used. Use [`multer`][] or a similar middleware to add support
for `multipart/form-data` content, which may be useful for GraphQL mutations
involving uploading files.

If the POST body has not yet been parsed, graphql-express will interpret it
depending on the provided *Content-Type* header.

  * **`application/json`**: the POST body will be parsed as a JSON
    object of parameters.

  * **`application/x-www-form-urlencoded`**: this POST body will be
    parsed as a url-encoded string of key-value pairs.

  * **`application/graphql`**: The POST body will be parsed as GraphQL
    query string, which provides the `query` parameter.


[`graphql-js`]: https://github.com/graphql/graphql-js
[`multer`]: https://github.com/expressjs/multer
[npm-image]: https://img.shields.io/npm/v/koa-gql.svg?style=flat-square
[npm-url]: https://npmjs.org/package/koa-gql
[travis-image]: https://travis-ci.org/chentsulin/koa-graphql.svg
[travis-url]: https://travis-ci.org/chentsulin/koa-graphql
[coveralls-image]: https://coveralls.io/repos/chentsulin/koa-graphql/badge.svg?branch=master&service=github
[coveralls-url]: https://coveralls.io/github/chentsulin/koa-graphql?branch=master
[david_img]: https://david-dm.org/chentsulin/koa-graphql.svg
[david_site]: https://david-dm.org/chentsulin/koa-graphql
