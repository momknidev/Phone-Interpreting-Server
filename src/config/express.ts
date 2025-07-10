import express from 'express';
import { urlencoded } from 'body-parser';
import { createServer } from 'node:http';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginLandingPageLocalDefault, ApolloServerPluginLandingPageProductionDefault }
    from '@apollo/server/plugin/landingPage/default';
import resolvers from '../schema/resolvers';
import typeDefs from '../schema/typeDefs';
import { apiRoutes } from '../rest';


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
            context: async ({ req }) => ({ token: req.headers.token }),
        }),
    );
};

// Call the async function
startServer().catch(err => console.error('Failed to start server:', err));



export { app, httpServer };