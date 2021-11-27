import type {
  ASTVisitor,
  DocumentNode,
  ExecutionArgs,
  ExecutionResult,
  FormattedExecutionResult,
  GraphQLSchema,
  GraphQLFieldResolver,
  GraphQLTypeResolver,
  GraphQLFormattedError,
  ValidationContext,
} from 'graphql';
import type { GraphQLParams, RequestInfo } from 'express-graphql';
import httpError from 'http-errors';
import {
  Source,
  GraphQLError,
  validateSchema,
  parse,
  validate,
  execute,
  formatError,
  getOperationAST,
  specifiedRules,
} from 'graphql';
import { getGraphQLParams } from 'express-graphql';

import type { Context, Request, Response } from 'koa';

import { renderGraphiQL } from './renderGraphiQL';
import type { GraphiQLOptions, GraphiQLData } from './renderGraphiQL';

type MaybePromise<T> = Promise<T> | T;

/**
 * Used to configure the graphqlHTTP middleware by providing a schema
 * and other configuration options.
 *
 * Options can be provided as an Object, a Promise for an Object, or a Function
 * that returns an Object or a Promise for an Object.
 */
export type Options =
  | ((
      request: Request,
      response: Response,
      ctx: Context,
      params?: GraphQLParams,
    ) => OptionsResult)
  | OptionsResult;
export type OptionsResult = MaybePromise<OptionsData>;

export interface OptionsData {
  /**
   * A GraphQL schema from graphql-js.
   */
  schema: GraphQLSchema;

  /**
   * A value to pass as the context to this middleware.
   */
  context?: unknown;

  /**
   * An object to pass as the rootValue to the graphql() function.
   */
  rootValue?: unknown;

  /**
   * A boolean to configure whether the output should be pretty-printed.
   */
  pretty?: boolean;

  /**
   * An optional array of validation rules that will be applied on the document
   * in additional to those defined by the GraphQL spec.
   */
  validationRules?: ReadonlyArray<(ctx: ValidationContext) => ASTVisitor>;

  /**
   * An optional function which will be used to validate instead of default `validate`
   * from `graphql-js`.
   */
  customValidateFn?: (
    schema: GraphQLSchema,
    documentAST: DocumentNode,
    rules: ReadonlyArray<any>,
  ) => ReadonlyArray<GraphQLError>;

  /**
   * An optional function which will be used to execute instead of default `execute`
   * from `graphql-js`.
   */
  customExecuteFn?: (args: ExecutionArgs) => MaybePromise<ExecutionResult>;

  /**
   * An optional function which will be used to format any errors produced by
   * fulfilling a GraphQL operation. If no function is provided, GraphQL's
   * default spec-compliant `formatError` function will be used.
   */
  customFormatErrorFn?: (error: GraphQLError) => GraphQLFormattedError;

  /**
   * An optional function which will be used to create a document instead of
   * the default `parse` from `graphql-js`.
   */
  customParseFn?: (source: Source) => DocumentNode;

  /**
   * `formatError` is deprecated and replaced by `customFormatErrorFn`. It will
   *  be removed in version 1.0.0.
   */
  formatError?: (error: GraphQLError, context?: any) => GraphQLFormattedError;

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
  extensions?: (
    info: RequestInfo,
  ) => MaybePromise<undefined | { [key: string]: unknown }>;

  /**
   * A boolean to optionally enable GraphiQL mode.
   * Alternatively, instead of `true` you can pass in an options object.
   */
  graphiql?: boolean | GraphiQLOptions;

  /**
   * A resolver function to use when one is not provided by the schema.
   * If not provided, the default field resolver is used (which looks for a
   * value or method on the source value with the field's name).
   */
  fieldResolver?: GraphQLFieldResolver<unknown, unknown>;

  /**
   * A type resolver function to use when none is provided by the schema.
   * If not provided, the default type resolver is used (which looks for a
   * `__typename` field or alternatively calls the `isTypeOf` method).
   */
  typeResolver?: GraphQLTypeResolver<unknown, unknown>;
}

type Middleware = (ctx: Context) => Promise<void>;

/**
 * Middleware for express; takes an options object or function as input to
 * configure behavior, and returns an express middleware.
 */
export function graphqlHTTP(options: Options): Middleware {
  devAssertIsNonNullable(options, 'GraphQL middleware requires options.');

  return async function middleware(ctx): Promise<void> {
    const req = ctx.req;
    const request = ctx.request;
    const response = ctx.response;

    // Higher scoped variables are referred to at various stages in the
    // asynchronous state machine below.
    let params: GraphQLParams | undefined;
    let showGraphiQL = false;
    let graphiqlOptions: GraphiQLOptions | undefined;
    let formatErrorFn = formatError;
    let pretty = false;
    let result: ExecutionResult;

    try {
      // Parse the Request to get GraphQL request parameters.
      try {
        // Use request.body when req.body is undefined.
        const expressReq = req as any;
        expressReq.body = expressReq.body ?? request.body;

        params = await getGraphQLParams(expressReq);
      } catch (error: unknown) {
        // When we failed to parse the GraphQL parameters, we still need to get
        // the options object, so make an options call to resolve just that.
        const optionsData = await resolveOptions();
        pretty = optionsData.pretty ?? false;
        formatErrorFn =
          optionsData.customFormatErrorFn ??
          optionsData.formatError ??
          formatErrorFn;
        throw error;
      }

      // Then, resolve the Options to get OptionsData.
      const optionsData = await resolveOptions(params);

      // Collect information from the options data object.
      const schema = optionsData.schema;
      const rootValue = optionsData.rootValue;
      const validationRules = optionsData.validationRules ?? [];
      const fieldResolver = optionsData.fieldResolver;
      const typeResolver = optionsData.typeResolver;
      const graphiql = optionsData.graphiql ?? false;
      const extensionsFn = optionsData.extensions;
      const context = optionsData.context ?? ctx;
      const parseFn = optionsData.customParseFn ?? parse;
      const executeFn = optionsData.customExecuteFn ?? execute;
      const validateFn = optionsData.customValidateFn ?? validate;

      pretty = optionsData.pretty ?? false;

      formatErrorFn =
        optionsData.customFormatErrorFn ??
        optionsData.formatError ??
        formatErrorFn;

      devAssertIsObject(
        schema,
        'GraphQL middleware options must contain a schema.',
      );

      // GraphQL HTTP only supports GET and POST methods.
      if (request.method !== 'GET' && request.method !== 'POST') {
        throw httpError(405, 'GraphQL only supports GET and POST requests.', {
          headers: { Allow: 'GET, POST' },
        });
      }

      // Get GraphQL params from the request and POST body data.
      const { query, variables, operationName } = params;
      showGraphiQL = canDisplayGraphiQL(request, params) && graphiql !== false;
      if (typeof graphiql !== 'boolean') {
        graphiqlOptions = graphiql;
      }

      // If there is no query, but GraphiQL will be displayed, do not produce
      // a result, otherwise return a 400: Bad Request.
      if (query == null) {
        if (showGraphiQL) {
          return respondWithGraphiQL(response, graphiqlOptions);
        }
        throw httpError(400, 'Must provide query string.');
      }

      // Validate Schema
      const schemaValidationErrors = validateSchema(schema);
      if (schemaValidationErrors.length > 0) {
        // Return 500: Internal Server Error if invalid schema.
        throw httpError(500, 'GraphQL schema validation error.', {
          graphqlErrors: schemaValidationErrors,
        });
      }

      // Parse source to AST, reporting any syntax error.
      let documentAST: DocumentNode;

      try {
        documentAST = parseFn(new Source(query, 'GraphQL request'));
      } catch (syntaxError: unknown) {
        // Return 400: Bad Request if any syntax errors errors exist.
        throw httpError(400, 'GraphQL syntax error.', {
          graphqlErrors: [syntaxError],
        });
      }

      // Validate AST, reporting any errors.
      const validationErrors = validateFn(schema, documentAST, [
        ...specifiedRules,
        ...validationRules,
      ]);

      if (validationErrors.length > 0) {
        // Return 400: Bad Request if any validation errors exist.
        throw httpError(400, 'GraphQL validation error.', {
          graphqlErrors: validationErrors,
        });
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
            return respondWithGraphiQL(response, graphiqlOptions, params);
          }

          // Otherwise, report a 405: Method Not Allowed error.
          throw httpError(
            405,
            `Can only perform a ${operationAST.operation} operation from a POST request.`,
            { headers: { Allow: 'POST' } },
          );
        }
      }

      // Perform the execution, reporting any errors creating the context.
      try {
        result = await executeFn({
          schema,
          document: documentAST,
          rootValue,
          contextValue: context,
          variableValues: variables,
          operationName,
          fieldResolver,
          typeResolver,
        });
        response.status = 200;
      } catch (contextError: unknown) {
        // Return 400: Bad Request if any execution context errors exist.
        throw httpError(400, 'GraphQL execution context error.', {
          graphqlErrors: [contextError],
        });
      }

      // Collect and apply any metadata extensions if a function was provided.
      // https://graphql.github.io/graphql-spec/#sec-Response-Format
      if (extensionsFn) {
        const extensions = await extensionsFn({
          document: documentAST,
          variables,
          operationName,
          result,
          context,
        });

        if (extensions != null) {
          result = { ...result, extensions };
        }
      }
    } catch (rawError: unknown) {
      // If an error was caught, report the httpError status, or 500.
      const error = httpError(
        500,
        /* istanbul ignore next: Thrown by underlying library. */
        rawError instanceof Error ? rawError : String(rawError),
      );
      response.status = error.status;

      const { headers } = error;
      if (headers != null) {
        for (const [key, value] of Object.entries(headers)) {
          response.set(key, value);
        }
      }

      if (error.graphqlErrors == null) {
        const graphqlError = new GraphQLError(
          error.message,
          undefined,
          undefined,
          undefined,
          undefined,
          error,
        );
        result = { data: undefined, errors: [graphqlError] };
      } else {
        result = { data: undefined, errors: error.graphqlErrors };
      }
    }

    // If no data was included in the result, that indicates a runtime query
    // error, indicate as such with a generic status code.
    // Note: Information about the error itself will still be contained in
    // the resulting JSON payload.
    // https://graphql.github.io/graphql-spec/#sec-Data
    if (response.status === 200 && result.data == null) {
      response.status = 500;
    }

    // Format any encountered errors.
    const formattedResult: FormattedExecutionResult = {
      ...result,
      errors: result.errors?.map(formatErrorFn),
    };

    // If allowed to show GraphiQL, present it instead of JSON.
    if (showGraphiQL) {
      return respondWithGraphiQL(
        response,
        graphiqlOptions,
        params,
        formattedResult,
      );
    }

    // Otherwise, present JSON directly.
    const payload = pretty
      ? JSON.stringify(formattedResult, null, 2)
      : formattedResult;
    response.type = 'application/json';
    response.body = payload;

    async function resolveOptions(
      requestParams?: GraphQLParams,
    ): Promise<OptionsData> {
      const optionsResult = await Promise.resolve(
        typeof options === 'function'
          ? options(request, response, ctx, requestParams)
          : options,
      );

      devAssertIsObject(
        optionsResult,
        'GraphQL middleware option function must return an options object or a promise which will be resolved to an options object.',
      );

      if (optionsResult.formatError) {
        // eslint-disable-next-line no-console
        console.warn(
          '`formatError` is deprecated and replaced by `customFormatErrorFn`. It will be removed in version 1.0.0.',
        );
      }

      return optionsResult;
    }
  };
}

function respondWithGraphiQL(
  response: Response,
  options?: GraphiQLOptions,
  params?: GraphQLParams,
  result?: FormattedExecutionResult,
): void {
  const data: GraphiQLData = {
    query: params?.query,
    variables: params?.variables,
    operationName: params?.operationName,
    result,
  };
  const payload = renderGraphiQL(data, options);

  response.type = 'text/html';
  response.body = payload;
}

/**
 * Helper function to determine if GraphiQL can be displayed.
 */
function canDisplayGraphiQL(request: Request, params: GraphQLParams): boolean {
  // If `raw` false, GraphiQL mode is not enabled.
  // Allowed to show GraphiQL if not requested as raw and this request prefers HTML over JSON.
  return !params.raw && request.accepts(['json', 'html']) === 'html';
}

function devAssertIsObject(value: unknown, message: string): void {
  devAssert(value != null && typeof value === 'object', message);
}

function devAssertIsNonNullable(value: unknown, message: string): void {
  devAssert(value != null, message);
}

function devAssert(condition: unknown, message: string): void {
  const booleanCondition = Boolean(condition);
  if (!booleanCondition) {
    throw new TypeError(message);
  }
}
