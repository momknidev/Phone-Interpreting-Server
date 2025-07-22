import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { vars } from './vars';
import * as schema from '../models';
import 'dotenv/config';
const { postgres: postgresVars, env } = vars;

export const postgresClient = new Client({
  host: postgresVars.host,
  port: postgresVars.port,
  user: postgresVars.user,
  password: postgresVars.password,
  database: postgresVars.db,
});

export const db =
  env === 'develop'
    ? drizzle(postgresClient, { schema })
    : drizzle(process.env.DATABASE_URL || '');

