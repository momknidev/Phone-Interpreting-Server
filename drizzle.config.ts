
import { defineConfig } from 'drizzle-kit';
import "dotenv/config";

export default defineConfig({
    dialect: 'postgresql',
    out: './drizzle',
    schema: './src/models',
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
