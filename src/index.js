/* @flow strict */

import {
  Source,
  validateSchema,
  parse,
  validate,
  execute,
  formatError,
  getOperationAST,
  specifiedRules,
} from 'graphql';
import expressGraphQL from 'express-graphql';
import httpError from 'http-errors';

import { renderGraphiQL } from './renderGraphiQL';

import type {
  GraphQLError,
  GraphQLSchema,
  GraphQLFieldResolver,
  ValidationContext,
  ASTVisitor,
} from 'graphql';
import type { Context, Request, Response } from 'koa';
import type { GraphQLParams, RequestInfo } from 'express-graphql';

const { getGraphQLParams } = expressGraphQL;

/**
 * Used to configure the graphqlHTTP middleware by providing a schema
 * and other configuration options.
 *
 * Options can be provided as an Object, a Promise for an Object, or a Function
 * that returns an Object or a Promise for an Object.
 */
export type Options =
  | ((request: Request, response: Response, ctx: Context) => OptionsResult)
  | OptionsResult;
export type OptionsResult = OptionsData | Promise<OptionsData>;
export type OptionsData = {
  /**
   * A GraphQL schema from graphql-js.
   */
  schema: GraphQLSchema,

  /**
   * A value to pass as the context to this middleware.
   */
  context?: ?mixed,

  /**
   * An object to pass as the rootValue to the graphql() function.
   */
  rootValue?: ?mixed,

  /**
   * A boolean to configure whether the output should be pretty-printed.
   */
  pretty?: ?boolean,

  /**
   * An optional function which will be used to format any errors produced by
   * fulfilling a GraphQL operation. If no function is provided, GraphQL's
   * default spec-compliant `formatError` function will be used.
   */
  formatError?: ?(error: GraphQLError, context?: ?any) => mixed,

  /**
   * An optional array of validation rules that will be applied on the document
   * in additional to those defined by the GraphQL spec.
   */
  validationRules?: ?Array<(ValidationContext) => ASTVisitor>,

  /**
   * An optional function for adding additional metadata to the GraphQL response
   * as a key-value object. The result will be added to "extensions" field in
   * the resulting JSON. This is often a useful place to add development time
   * info such as the runtime of a query or the amount of resources consumed.
   *
   * Information about the request is provided to be used.
   *
   * This function may be async.
   */
  extensions?: ?(info: RequestInfo) => { [key: string]: mixed },

  /**
   * A boolean to optionally enable GraphiQL mode.
   */
  graphiql?: ?boolean,

  /**
   * A resolver function to use when one is not provided by the schema.
   * If not provided, the default field resolver is used (which looks for a
   * value or method on the source value with the field's name).
   */
  fieldResolver?: ?GraphQLFieldResolver<any, any>,
};

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
    let fieldResolver;
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
      const optionsData = await (typeof options === 'function'
        ? options(request, response, ctx)
        : options);

      // Assert that optionsData is in fact an Object.
      if (!optionsData || typeof optionsData !== 'object') {
        throw new Error(
          'GraphQL middleware option function must return an options object ' +
            'or a promise which will be resolved to an options object.',
        );
      }

      // Assert that schema is required.
      if (!optionsData.schema) {
        throw new Error('GraphQL middleware options must contain a schema.');
      }

      // Collect information from the options data object.
      schema = optionsData.schema;
      context = optionsData.context || ctx;
      rootValue = optionsData.rootValue;
      fieldResolver = optionsData.fieldResolver;
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
            return resolve(null);
          }
          throw httpError(400, 'Must provide query string.');
        }

        // Validate Schema
        const schemaValidationErrors = validateSchema(schema);
        if (schemaValidationErrors.length > 0) {
          // Return 500: Internal Server Error if invalid schema.
          response.status = 500;
          return resolve({ errors: schemaValidationErrors });
        }

        // GraphQL source.
        const source = new Source(query, 'GraphQL request');

        // Parse source to AST, reporting any syntax error.
        try {
          documentAST = parse(source);
        } catch (syntaxError) {
          // Return 400: Bad Request if any syntax errors errors exist.
          response.status = 400;
          return resolve({ errors: [syntaxError] });
        }

        // Validate AST, reporting any errors.
        const validationErrors = validate(schema, documentAST, validationRules);
        if (validationErrors.length > 0) {
          // Return 400: Bad Request if any validation errors exist.
          response.status = 400;
          return resolve({ errors: validationErrors });
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
              return resolve(null);
            }

            // Otherwise, report a 405: Method Not Allowed error.
            response.set('Allow', 'POST');
            throw httpError(
              405,
              `Can only perform a ${operationAST.operation} operation ` +
                'from a POST request.',
            );
          }
        }

        // Perform the execution, reporting any errors creating the context.
        try {
          resolve(
            execute(
              schema,
              documentAST,
              rootValue,
              context,
              variables,
              operationName,
              fieldResolver,
            ),
          );
          response.status = 200;
        } catch (contextError) {
          // Return 400: Bad Request if any execution context errors exist.
          response.status = 400;
          resolve({ errors: [contextError] });
        }
      });

      // Collect and apply any metadata extensions if a function was provided.
      // http://facebook.github.io/graphql/#sec-Response-Format
      if (result && extensionsFn) {
        result = await Promise.resolve(
          extensionsFn({
            document: documentAST,
            variables,
            operationName,
            result,
            context,
          }),
        ).then(extensions => {
          if (extensions && typeof extensions === 'object') {
            (result: any).extensions = extensions;
          }
          return result;
        });
      }
    } catch (error) {
      // If an error was caught, report the httpError status, or 500.
      response.status = error.status || 500;
      result = { errors: [error] };
    }

    // If no data was included in the result, that indicates a runtime query
    // error, indicate as such with a generic status code.
    // Note: Information about the error itself will still be contained in
    // the resulting JSON payload.
    // http://facebook.github.io/graphql/#sec-Data
    if (response.status === 200 && result && !result.data) {
      response.status = 500;
    }
    // Format any encountered errors.
    if (result && result.errors) {
      (result: any).errors = result.errors.map(
        err => (formatErrorFn ? formatErrorFn(err, context) : formatError(err)),
      );
    }

    // If allowed to show GraphiQL, present it instead of JSON.
    if (showGraphiQL) {
      const payload = renderGraphiQL({
        query,
        variables,
        operationName,
        result,
      });
      response.type = 'text/html';
      response.body = payload;
    } else {
      // Otherwise, present JSON directly.
      const payload = pretty ? JSON.stringify(result, null, 2) : result;
      response.type = 'application/json';
      response.body = payload;
    }
  };
}

/**
 * Helper function to determine if GraphiQL can be displayed.
 */
function canDisplayGraphiQL(request: Request, params: GraphQLParams): boolean {
  // If `raw` exists, GraphiQL mode is not enabled.
  // Allowed to show GraphiQL if not requested as raw and this request
  // prefers HTML over JSON.
  return !params.raw && request.accepts(['json', 'html']) === 'html';
}
