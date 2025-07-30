import { drizzle } from 'drizzle-orm/node-postgres';
import 'dotenv/config';
import * as schema from '../models';

export const db = drizzle(process.env.DATABASE_URL || '', {
    schema
},
);

