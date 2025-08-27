import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  decimal,
  numeric,
  serial,
  integer,
} from 'drizzle-orm/pg-core';
import { interpreter } from './interpreter';
import { Client } from './client_table';
import { Languages, LanguagesTarget } from './language_table';
import { ClientCode } from './client_codes_table';

export const CallReports = pgTable('call_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  call_date: timestamp('call_date').notNull(),
  serial_no: serial('serial_no').notNull(),
  client_id: uuid('client_id')
    .references(() => Client.id)
    .notNull(),
  phone_number: varchar('phone_number').notNull(),
  caller_phone: varchar('caller_phone').notNull(),
  client_code: uuid('client_code').references(() => ClientCode.id),
  source_language_id: uuid('source_language_id').references(() => Languages.id),
  target_language_id: uuid('target_language_id').references(
    () => LanguagesTarget.id,
  ),
  interpreter_id: uuid('interpreter_id').references(() => interpreter.id),
  status: varchar('status', { length: 50 }).notNull(), // e.g., pending, completed
  call_duration: decimal('call_duration', { precision: 5, scale: 2 }),
  amount: decimal('amount', { precision: 10, scale: 2 }),
  used_credits: integer('used_credits').default(0),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});
