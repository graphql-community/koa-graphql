/* @flow */

import httpError from 'http-errors';
import { graphql } from 'graphql';
import { formatError } from 'graphql/error';
import { parseBody as originalParseBody } from './parseBody';
import { renderGraphiQL } from './renderGraphiQL';
import Promise from 'bluebird';
import type { Request, Response } from 'koa';

var parseBody = Promise.promisify(originalParseBody);


/**
 * Used to configure the graphQLHTTP middleware by providing a schema
 * and other configuration options.
 */
export type Options = ((req: Request) => OptionsObj) | OptionsObj
export type OptionsObj = {
  /**
   * A GraphQL schema from graphql-js.
   */
  schema: Object,

  /**
   * An object to pass as the rootValue to the graphql() function.
   */
  rootValue?: ?Object,

  /**
   * A boolean to configure whether the output should be pretty-printed.
   */
  pretty?: ?boolean,

   /**
    * A boolean to optionally enable GraphiQL mode
    */
  graphiql?: ?boolean,
};

/**
 * Middleware for express; takes an options object or function as input to
 * configure behavior, and returns an express middleware.
 */
export default function graphqlHTTP(options: Options) {
  if (!options) {
    throw new Error('GraphQL middleware requires options.');
  }

  return function *middleware() {
    var req = this.req;
    var request = this.request;
    var response = this.response;

    // Get GraphQL options given this request.
    var {
      schema,
      rootValue,
      pretty,
      graphiql,
    } = getOptions(options, request, this);

    // GraphQL HTTP only supports GET and POST methods.
    if (request.method !== 'GET' && request.method !== 'POST') {
      response.set('Allow', 'GET, POST');
      return sendError(
        response,
        httpError(405, 'GraphQL only supports GET and POST requests.'),
        pretty
      );
    }

    // Parse the Request body.
    var data;
    try {
      data = yield parseBody(req, request);
      data = data || {};

      // Get GraphQL params from the request and POST body data.
      var { query, variables, operationName } = getGraphQLParams(request, data);


      // If there is no query, present an empty GraphiQL if possible, otherwise
      // return a 400 level error.
      if (!query) {
        if (graphiql && canDisplayGraphiQL(request, data)) {
          response.type = 'text/html';
          response.body = renderGraphiQL();
          return;
        }
        throw httpError(400, 'Must provide query string.');
      }

      // Run GraphQL query.
      var result = yield graphql(
        schema,
        query,
        rootValue,
        variables,
        operationName
      );

      // Format any encountered errors.
      if (result.errors) {
        result.errors = result.errors.map(formatError);
      }

      // Report 200:Success if a data key exists,
      // Otherwise 400:BadRequest if only errors exist.
      response.status = result.hasOwnProperty('data') ? 200 : 400;

      // If allowed to show GraphiQL, present it instead of JSON.
      if (graphiql && canDisplayGraphiQL(request, data)) {
        response.type = 'text/html';
        response.body = renderGraphiQL({ query, variables, result });
      } else {
        // Otherwise, present JSON directly.
        response.type = 'application/json';
        response.body = JSON.stringify(result, null, pretty ? 2 : 0);
      }
    } catch (error) {
      // Format any request errors the same as GraphQL errors.
      return sendError(response, error, pretty);
    }
  };
}

/**
 * Get the options that the middleware was configured with, sanity
 * checking them.
 */
function getOptions(options: Options, request: Request, context): OptionsObj {
  var optionsData = typeof options === 'function' ?
                  options(request, context) : options;

  if (!optionsData || typeof optionsData !== 'object') {
    throw new Error(
      'GraphQL middleware option function must return an options object.'
    );
  }

  if (!optionsData.schema) {
    throw new Error(
      'GraphQL middleware options must contain a schema.'
    );
  }

  return optionsData;
}

type GraphQLParams = {
  query: ?string;
  variables: ?Object;
  operationName: ?string;
}

/**
 * Helper function to get the GraphQL params from the request.
 */
function getGraphQLParams(request: Request, data: Object): GraphQLParams {
  // GraphQL Query string.
  var query = request.query.query || data.query;

  // Parse the variables if needed.
  var variables = request.query.variables || data.variables;
  if (variables && typeof variables === 'string') {
    try {
      variables = JSON.parse(variables);
    } catch (error) {
      throw httpError(400, 'Variables are invalid JSON.');
    }
  }

  // Name of GraphQL operation to execute.
  var operationName = request.query.operationName || data.operationName;

  return { query, variables, operationName };
}

/**
 * Helper function to determine if GraphiQL can be displayed.
 */
function canDisplayGraphiQL(request: Request, data: Object): boolean {
  // If `raw` exists, GraphiQL mode is not enabled.
  var raw = request.query.raw !== undefined || data.raw !== undefined;
  // Allowed to show GraphiQL if not requested as raw and this request
  // prefers HTML over JSON.
  return !raw && request.accepts([ 'json', 'html' ]) === 'html';
}

/**
 * Helper for formatting errors
 */
function sendError(response: Response, error: Error, pretty?: ?boolean): void {
  var errorResponse = { errors: [ formatError(error) ] };
  response.status = error.status || 500;
  response.type = 'application/json';
  response.body = JSON.stringify(errorResponse, null, pretty ? 2 : 0);
}
