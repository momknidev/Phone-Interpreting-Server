import {
  pgTable,
  varchar,
  integer,
  timestamp,
  uuid,
  numeric,
} from 'drizzle-orm/pg-core';
import { Client } from './client_table';

export const ClientCode = pgTable('client_codes', {
  id: uuid('id').primaryKey(),
  client_id: uuid('client_id').references(() => Client.id),
  client_code: integer('client_code').notNull().unique(),
  phone_number: varchar('phone_number').notNull(),
  code_label: varchar('code_label', { length: 100 }).notNull(),
  credits: numeric('credits', { precision: 10, scale: 2 }).default('0'),
  status: varchar('status', { length: 50 }).notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
