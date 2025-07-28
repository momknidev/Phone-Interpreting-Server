import { pgTable, uuid, varchar, timestamp, decimal, numeric } from 'drizzle-orm/pg-core';
import { mediator } from './mediator';
import { Client } from './client_table';
import { Languages } from './language_table';

export const PhoneMediation = pgTable('phone_mediation', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone_mediation_no: numeric('phone_mediation_no',).notNull().unique(),
  client_id: uuid('client_id').references(() => Client.id).notNull(),
  mediator_id: uuid('mediator_id').references(() => mediator.id).notNull(),
  caller_phone: varchar('caller_phone', { length: 20 }).notNull(), // E.164 format (e.g., "+1234567890")
  caller_code: varchar('caller_code', { length: 50 }).notNull(),
  source_language_id: uuid('source_language_id').references(() => Languages.id).notNull(),
  target_language_id: uuid('target_language_id').references(() => Languages.id).notNull(),
  status: varchar('status', { length: 50 }).notNull(), // e.g., pending, completed
  mediation_date: timestamp('mediation_date').notNull(),
  mediation_duration: decimal('mediation_duration', { precision: 5, scale: 2, }),
  amount: decimal('amount', { precision: 10, scale: 2 }),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});
