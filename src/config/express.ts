import express from 'express';
import { urlencoded } from 'body-parser';
import { createServer } from 'node:http';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginLandingPageLocalDefault, ApolloServerPluginLandingPageProductionDefault }
    from '@apollo/server/plugin/landingPage/default';
import jwt from 'jsonwebtoken';
import resolvers from '../schema/resolvers';
import typeDefs from '../schema/typeDefs';
import { apiRoutes } from '../rest';
import { vars } from './vars';
const { secret_key } = vars;

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
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer }),
    process.env.NODE_ENV === 'production'
        ? ApolloServerPluginLandingPageProductionDefault()
        : ApolloServerPluginLandingPageLocalDefault({ embed: false })
    ],
    csrfPrevention: false,
});

// Initialize server in an async function
const startServer = async () => {
    await server.start();
    app.use('/graphql',
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
                    jwt.verify(
                        token,
                        secret_key as string,
                        async (err, decoded) => {
                            if (err) {
                                // console.error('Error verifying token:', err);
                                return;
                            }

                            if (decoded) {
                                user = decoded as { id: string; email: string; role: string };
                                return { user: decoded };
                            }
                        }
                    )
                }


                return { user };
            },
        }),
    );
};

startServer().catch(err => console.error('Failed to start server:', err));



export { app, httpServer };