import { pgTable, varchar, integer, timestamp, uuid } from 'drizzle-orm/pg-core';
import { Client } from './client_table';

export const Languages = pgTable('languages', {
  id: uuid('id').primaryKey(),
  client_id: uuid('client_id').references(() => Client.id).notNull(),
  phone_number: varchar('phone_number').notNull(),
  language_code: integer('language_code').notNull(),
  language_name: varchar('language_name', { length: 100 }).notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
