import { pgTable, uuid, varchar, timestamp, decimal, numeric } from 'drizzle-orm/pg-core';
import { interpreter } from './interpreter';
import { Client } from './client_table';
import { Languages } from './language_table';

export const CallReports = pgTable('call_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  serial_no: numeric('serial_no',).notNull().unique(),
  client_id: uuid('client_id').references(() => Client.id).notNull(),
  mediator_id: uuid('mediator_id').references(() => interpreter.id).notNull(),
  caller_phone: varchar('caller_phone', { length: 20 }).notNull(), // E.164 format (e.g., "+1234567890")
  caller_code: varchar('caller_code', { length: 50 }).notNull(),
  source_language_id: uuid('source_language_id').references(() => Languages.id).notNull(),
  target_language_id: uuid('target_language_id').references(() => Languages.id).notNull(),
  status: varchar('status', { length: 50 }).notNull(), // e.g., pending, completed
  call_date: timestamp('call_date').notNull(),
  call_duration: decimal('call_duration', { precision: 5, scale: 2, }),
  amount: decimal('amount', { precision: 10, scale: 2 }),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});
