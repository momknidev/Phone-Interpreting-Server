/* eslint-disable @typescript-eslint/quotes */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import "dotenv/config";

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool)