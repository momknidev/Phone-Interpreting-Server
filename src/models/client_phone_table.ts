import { pgTable, uuid, varchar, boolean } from 'drizzle-orm/pg-core';
import { Client } from './client_table';

export const ClientPhone = pgTable('client_phones', {
  id: uuid('id').primaryKey().defaultRandom(),
  client_id: uuid('client_id').notNull().references(() => Client.id),
  phoneNumber: varchar('phone_number', { length: 20 }).notNull(), // E.164 format
  label: varchar('label', { length: 50 }), // e.g. "Office", "Personal"
  isPrimary: boolean('is_primary').default(false), // optional, mark primary number
});