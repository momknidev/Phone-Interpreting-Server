/* eslint-disable @typescript-eslint/quotes */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import "dotenv/config";

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // connectionTimeoutMillis: 5000, // Increase connection timeout if the connection is slow
    // idleTimeoutMillis: 10000, // Increase idle timeout to prevent disconnections
    // max: 20, // Set a higher maximum number of connections
    keepAlive: true, // Keep the connection alive
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, // Use SSL in production

});

export const db = drizzle(pool)