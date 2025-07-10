import { logger } from '../config/logger';
import { vars } from '../config/vars';
import express from "express";
import { createServer } from 'http';
import { ApolloServer } from 'apollo-server-express';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { execute, subscribe } from 'graphql';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { graphqlUploadExpress } from 'graphql-upload';
import jwt from 'jsonwebtoken';
import { typeDefs } from '../graphql/typeDefs';
import { resolvers } from '../graphql/resolvers';
import { prometheusPlugin } from '../plugins/prometheusPlugin';
import { httpServer } from '../config/express';

const { port: PORT, env, SECRET_KEY } = vars;

export const startApiServer = async () => {
    logger.info('boot:apiServer:start');
    const app = express();

    const schema = makeExecutableSchema({
        typeDefs,
        resolvers,
        csrfPrevention: true,
    });

    const server = new ApolloServer({
        schema,
        context: (context) => {
            let token;
            if (context.req && context.req.headers.authorization) {
                token = context.req.headers.authorization.split("Bearer ")[1];
            } else if (context.connection && context.connection.context.Authorization) {
                token = context.connection.context.Authorization.split("Bearer ")[1];
            }

            if (token) {
                jwt.verify(token, SECRET_KEY, (err, decodedToken) => {
                    context.user = decodedToken;
                });
            }
            return context;
        },
        plugins: [
            {
                requestDidStart: ({ context }) => ({
                    willSendResponse: ({ response }) => {
                        context.res.set('Cache-Control', 'public, max-age=31536000, immutable');
                    },
                }),
            },
            prometheusPlugin,
        ],
    });

    await server.start();
    app.use(graphqlUploadExpress());

    server.applyMiddleware({ app, path: "/graphql" });

    SubscriptionServer.create(
        { schema, execute, subscribe },
        { server: httpServer, path: server.graphqlPath }
    );


    httpServer.listen(PORT, () => {
        logger.info(`🚀 Query endpoint ready at http://localhost:${PORT}${server.graphqlPath}`);
        logger.info(`🚀 Subscription endpoint ready at ws://localhost:${PORT}${server.graphqlPath}`);
        logger.info(`Core started on port ${PORT} (${env})`);
    });

    logger.info('boot:apiServer:complete');
};
