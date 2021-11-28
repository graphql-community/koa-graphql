import { createServer } from 'http';

import Koa from 'koa';
import mount from 'koa-mount';
import { execute, subscribe } from 'graphql';
import ws from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';

import { graphqlHTTP } from '../src';

import { schema, roots, rootValue } from './schema';

const PORT = 4000;
const subscriptionEndpoint = `ws://localhost:${PORT}/subscriptions`;

const app = new Koa();
app.use(
  mount(
    '/graphql',
    graphqlHTTP({
      schema,
      rootValue,
      graphiql: {
        subscriptionEndpoint,
        websocketClient: 'v1',
      },
    }),
  ),
);

const server = createServer(app.callback());

const wsServer = new ws.Server({
  server,
  path: '/subscriptions',
});

server.listen(PORT, () => {
  useServer(
    {
      schema,
      roots,
      execute,
      subscribe,
    },
    wsServer,
  );
  console.info(
    `Running a GraphQL API server with subscriptions at http://localhost:${PORT}/graphql`,
  );
});
