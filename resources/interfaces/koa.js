/* @flow strict */
/* Flow declarations for koa requests and responses */
/* eslint-disable no-unused-vars */
declare class Context {
  // Request
  accepts: (type: string | Array<string>) => ?string;
  acceptsEncodings: (
    encodings: string | Array<string>,
  ) => string | Array<string>;
  acceptsCharsets: (charsets: string | Array<string>) => string | Array<string>;
  acceptsLanguages: (langs: string | Array<string>) => string | Array<string>;
  get: (field: string) => ?string;
  is: (types: string | Array<string>) => string | boolean | null;
  querystring: string;
  idempotent: boolean;
  socket: net$Socket;
  search: string;
  method: string;
  query: Object;
  path: string;
  url: string;
  origin: string;
  href: string;
  subdomains: Array<string>;
  protocol: string;
  host: string;
  hostname: string;
  header: Object;
  headers: Object;
  secure: boolean;
  stale: boolean;
  fresh: boolean;
  ips: Array<string>;
  ip: string;

  // Response
  attachment: (filename: string) => void;
  redirect: (url: string, alt: string) => void;
  remove: (field: string) => void;
  vary: string;
  set: (field: string | Object | Array<string>, val: string) => void;
  append: (field: string, val: string | Array<string>) => void;
  status: number;
  message: string;
  body: mixed;
  length: number;
  type: string;
  lastModified: string | Date;
  etag: string;
  headerSent: boolean;
  writable: boolean;
}

declare class Request {
  header: Object;
  headers: Object;
  url: string;
  origin: string;
  href: string;
  method: string;
  path: string;
  query: Object;
  querystring: string;
  search: string;
  host: string;
  hostname: string;
  fresh: boolean;
  stale: boolean;
  idempotent: boolean;
  socket: net$Socket;
  charset: string;
  length: Number;
  protocol: string;
  secure: boolean;
  ip: string;
  ips: Array<string>;
  subdomains: Array<string>;
  accepts: (type: string | Array<string>) => ?string;
  acceptsEncodings: (
    encodings: string | Array<string>,
  ) => string | Array<string>;
  acceptsCharsets: (charsets: string | Array<string>) => string | Array<string>;
  acceptsLanguages: (langs: string | Array<string>) => string | Array<string>;
  is: (types: string | Array<string>) => string | boolean | null;
  type: string;
  get: (field: string) => ?string;
  inspect: () => ?Object;
  toJSON: () => Object;
  body: mixed;
}

declare class Response {
  socket: () => net$Socket;
  header: Object;
  headers: Object;
  status: number;
  message: string;
  body: mixed;
  length: number;
  headerSent: boolean;
  vary: string;
  redirect: (url: string, alt: string) => void;
  attachment: (filename: string) => void;
  type: string;
  lastModified: string | Date;
  etag: string;
  is: (types: string | Array<string>) => string | boolean;
  get: (field: string) => string;
  set: (field: string | Object | Array<string>, val: string) => void;
  append: (field: string, val: string | Array<string>) => void;
  remove: (field: string) => void;
  writable: boolean;
  inspect: () => ?Object;
  toJSON: () => Object;
}
