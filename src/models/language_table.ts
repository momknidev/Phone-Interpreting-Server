import {
  pgTable,
  varchar,
  integer,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { Client, clientPhones } from './client_table';

export const Languages = pgTable('source_languages', {
  id: uuid('id').primaryKey(),
  client_id: uuid('client_id')
    .references(() => Client.id)
    .notNull(),
  phone_number_id: uuid('phone_number_id')
    .notNull()
    .references(() => clientPhones.id, { onDelete: 'cascade' }),
  language_code: integer('language_code').notNull(),
  language_name: varchar('language_name', { length: 100 }).notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const LanguagesTarget = pgTable('target_languages', {
  id: uuid('id').primaryKey(),
  client_id: uuid('client_id')
    .references(() => Client.id)
    .notNull(),
  phone_number_id: uuid('phone_number_id')
    .notNull()
    .references(() => clientPhones.id, { onDelete: 'cascade' }),
  language_code: integer('language_code').notNull(),
  language_name: varchar('language_name', { length: 100 }).notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
