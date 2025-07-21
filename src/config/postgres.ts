/* eslint-disable @typescript-eslint/quotes */
import { drizzle } from 'drizzle-orm/node-postgres';
import "dotenv/config";

const db = drizzle(process.env.DATABASE_URL ||'');

export { db };