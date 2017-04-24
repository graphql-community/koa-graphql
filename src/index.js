/* @flow */

import {
  Source,
  parse,
  validate,
  execute,
  formatError,
  getOperationAST,
  specifiedRules
} from 'graphql';
import { getGraphQLParams } from 'express-graphql';
import httpError from 'http-errors';

import { renderGraphiQL } from './renderGraphiQL';

import type { Context, Request } from 'koa';
import type { OptionsResult, GraphQLParams } from 'express-graphql';


/**
 * Used to configure the graphqlHTTP middleware by providing a schema
 * and other configuration options.
 *
 * Options can be provided as an Object, a Promise for an Object, or a Function
 * that returns an Object or a Promise for an Object.
 */
export type Options =
  ((request: Request, ctx: Context) => OptionsResult) | OptionsResult;

type Middleware = (ctx: Context) => Promise<void>;

/**
 * Middleware for express; takes an options object or function as input to
 * configure behavior, and returns an express middleware.
 */
module.exports = graphqlHTTP;
function graphqlHTTP(options: Options): Middleware {
  if (!options) {
    throw new Error('GraphQL middleware requires options.');
  }

  return async function middleware(ctx): Promise<void> {
    const req = ctx.req;
    const request = ctx.request;
    const response = ctx.response;

    // Higher scoped variables are referred to at various stages in the
    // asynchronous state machine below.
    let schema;
    let context;
    let rootValue;
    let pretty;
    let graphiql;
    let formatErrorFn;
    let extensionsFn;
    let showGraphiQL;
    let query;
    let documentAST;
    let variables;
    let operationName;
    let validationRules;

    let result;

    try {
      // Promises are used as a mechanism for capturing any thrown errors during
      // the asynchronous process below.

      // Resolve the Options to get OptionsData.
      const optionsData = await Promise.resolve(
        typeof options === 'function' ?
          options(request, response, ctx) :
          options
      );

      // Assert that optionsData is in fact an Object.
      if (!optionsData || typeof optionsData !== 'object') {
        throw new Error(
          'GraphQL middleware option function must return an options object ' +
          'or a promise which will be resolved to an options object.'
        );
      }

      // Assert that schema is required.
      if (!optionsData.schema) {
        throw new Error(
          'GraphQL middleware options must contain a schema.'
        );
      }

      // Collect information from the options data object.
      schema = optionsData.schema;
      context = optionsData.context || ctx;
      rootValue = optionsData.rootValue;
      pretty = optionsData.pretty;
      graphiql = optionsData.graphiql;
      formatErrorFn = optionsData.formatError;
      extensionsFn = optionsData.extensions;

      validationRules = specifiedRules;
      if (optionsData.validationRules) {
        validationRules = validationRules.concat(optionsData.validationRules);
      }

      // GraphQL HTTP only supports GET and POST methods.
      if (request.method !== 'GET' && request.method !== 'POST') {
        response.set('Allow', 'GET, POST');
        throw httpError(405, 'GraphQL only supports GET and POST requests.');
      }

      // Use request.body when req.body is undefined.
      req.body = req.body || request.body;

      // Parse the Request to get GraphQL request parameters.
      const params: GraphQLParams = await getGraphQLParams(req);

      // Get GraphQL params from the request and POST body data.
      query = params.query;
      variables = params.variables;
      operationName = params.operationName;
      showGraphiQL = graphiql && canDisplayGraphiQL(request, params);

      result = await new Promise(resolve => {
        // If there is no query, but GraphiQL will be displayed, do not produce
        // a result, otherwise return a 400: Bad Request.
        if (!query) {
          if (showGraphiQL) {
            resolve(null);
          }
          throw httpError(400, 'Must provide query string.');
        }

        // GraphQL source.
        const source = new Source(query, 'GraphQL request');

        // Parse source to AST, reporting any syntax error.
        try {
          documentAST = parse(source);
        } catch (syntaxError) {
          // Return 400: Bad Request if any syntax errors errors exist.
          response.status = 400;
          resolve({ errors: [ syntaxError ] });
        }

        // Validate AST, reporting any errors.
        const validationErrors = validate(schema, documentAST, validationRules);
        if (validationErrors.length > 0) {
          // Return 400: Bad Request if any validation errors exist.
          response.status = 400;
          resolve({ errors: validationErrors });
        }

        // Only query operations are allowed on GET requests.
        if (request.method === 'GET') {
          // Determine if this GET request will perform a non-query.
          const operationAST = getOperationAST(documentAST, operationName);
          if (operationAST && operationAST.operation !== 'query') {
            // If GraphiQL can be shown, do not perform this query, but
            // provide it to GraphiQL so that the requester may perform it
            // themselves if desired.
            if (showGraphiQL) {
              resolve(null);
            }

            // Otherwise, report a 405: Method Not Allowed error.
            response.set('Allow', 'POST');
            throw httpError(
              405,
              `Can only perform a ${operationAST.operation} operation ` +
              'from a POST request.'
            );
          }
        }

        // Perform the execution, reporting any errors creating the context.
        try {
          resolve(execute(
            schema,
            documentAST,
            rootValue,
            context,
            variables,
            operationName
          ));
        } catch (contextError) {
          // Return 400: Bad Request if any execution context errors exist.
          response.status = 400;
          resolve({ errors: [ contextError ] });
        }
      });

      // Collect and apply any metadata extensions if a function was provided.
      // http://facebook.github.io/graphql/#sec-Response-Format
      if (result && extensionsFn) {
        result = await Promise.resolve(extensionsFn({
          document: documentAST,
          variables,
          operationName,
          result,
        }))
        .then(extensions => {
          if (extensions && typeof extensions === 'object') {
            (result: any).extensions = extensions;
          }
          return result;
        });
      }
    } catch (error) {
      // If an error was caught, report the httpError status, or 500.
      response.status = error.status || 500;
      result = { errors: [ error ] };
    }

    // If no data was included in the result, that indicates a runtime query
    // error, indicate as such with a generic status code.
    // Note: Information about the error itself will still be contained in
    // the resulting JSON payload.
    // http://facebook.github.io/graphql/#sec-Data
    if (result && result.data === null) {
      response.status = 500;
    }
    // Format any encountered errors.
    if (result && result.errors) {
      (result: any).errors = result.errors.map(formatErrorFn || formatError);
    }

    // If allowed to show GraphiQL, present it instead of JSON.
    if (showGraphiQL) {
      const payload = renderGraphiQL({
        query, variables,
        operationName, result
      });
      response.type = 'text/html';
      response.body = payload;
    } else {
      // Otherwise, present JSON directly.
      const payload = JSON.stringify(result, null, pretty ? 2 : 0);
      response.type = 'application/json';
      response.body = payload;
    }
  };
}

/**
 * Helper function to determine if GraphiQL can be displayed.
 */
function canDisplayGraphiQL(
  request: Request,
  params: GraphQLParams
): boolean {
  // If `raw` exists, GraphiQL mode is not enabled.
  // Allowed to show GraphiQL if not requested as raw and this request
  // prefers HTML over JSON.
  return !params.raw && request.accepts([ 'json', 'html' ]) === 'html';
}
