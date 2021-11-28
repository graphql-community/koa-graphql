import { createServer } from 'http';

import Koa from 'koa';
import mount from 'koa-mount';
import { execute, subscribe } from 'graphql';
import { SubscriptionServer } from 'subscriptions-transport-ws';

import { graphqlHTTP } from '../src';

import { schema, rootValue } from './schema';

const PORT = 4000;
const subscriptionEndpoint = `ws://localhost:${PORT}/subscriptions`;

const app = new Koa();
app.use(
  mount(
    '/graphql',
    graphqlHTTP({
      schema,
      rootValue,
      graphiql: { subscriptionEndpoint },
    }),
  ),
);

const ws = createServer(app.callback());

ws.listen(PORT, () => {
  console.log(
    `Running a GraphQL API server with subscriptions at http://localhost:${PORT}/graphql`,
  );
});

const onConnect = (_: any, __: any) => {
  console.log('connecting ....');
};

const onDisconnect = (_: any) => {
  console.log('disconnecting ...');
};

SubscriptionServer.create(
  {
    schema,
    rootValue,
    execute,
    subscribe,
    onConnect,
    onDisconnect,
  },
  {
    server: ws,
    path: '/subscriptions',
  },
);
