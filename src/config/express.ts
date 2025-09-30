import express from 'express';
import { urlencoded } from 'body-parser';
import { createServer } from 'node:http';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import {
  ApolloServerPluginLandingPageLocalDefault,
  ApolloServerPluginLandingPageProductionDefault,
} from '@apollo/server/plugin/landingPage/default';
import jwt from 'jsonwebtoken';
import { graphqlUploadExpress } from 'graphql-upload-ts'; // Default import (updated method)
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { execute, subscribe } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import resolvers from '../schema/resolvers';
import typeDefs from '../schema/typeDefs';
import { apiRoutes } from '../rest';
import { vars } from './vars';
import dotenv from 'dotenv';
import mailer from '@sendgrid/mail';

const { secret_key, node_mailer_key } = vars;
dotenv.config();

mailer.setApiKey(node_mailer_key);
const app = express();

app.use(urlencoded({ extended: false }));

app.use('/api', apiRoutes);

const httpServer = createServer(app);
interface MyContext {
  token?: String;
}
const server = new ApolloServer<MyContext>({
  typeDefs,
  resolvers,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    process.env.NODE_ENV === 'production'
      ? ApolloServerPluginLandingPageProductionDefault()
      : ApolloServerPluginLandingPageLocalDefault({ embed: false }),
  ],
  csrfPrevention: false,
});

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});
const startServer = async () => {
  await server.start();
  app.use(graphqlUploadExpress()); // Use default import middleware
  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        let token;
        let user = null;
        if (req && req.headers.authorization) {
          token = req.headers.authorization.split('Bearer ')[1];
        }
        if (token) {
          try {
            const decoded = jwt.verify(token, secret_key as string);
            if (decoded) {
              user = decoded as { id: string; email: string; role: string };
            }
          } catch (err) {
            // Invalid token, user remains null
          }
        }

        // Extract browser (user-agent) and IP address
        const browser = req.headers['user-agent'] || '';
        // Try to get real IP if behind proxy, else fallback to req.ip
        const ip =
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          req.socket.remoteAddress ||
          '';
        return { user, browser, ip, requestBody: req.body };
      },
    }),
  );

  SubscriptionServer.create(
    {
      schema,
      execute,
      subscribe,
      onConnect: async (connectionParams: any) => {
        console.log('🔌 Subscription client connected');
        return {};
      },
      onDisconnect: () => {
        console.log('🔌 Subscription client disconnected');
      },
    },
    {
      server: httpServer,
      path: '/graphql',
    },
  );
};

startServer().catch((err) => console.error('Failed to start server:', err));

export { app, httpServer };
