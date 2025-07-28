import {
  pgTable, uuid, varchar, timestamp, decimal, text,
} from 'drizzle-orm/pg-core';
import { mediator } from './mediator';
import { Users } from './user_table';
import { Languages } from './language_table';

export const RequestTable = pgTable('phone_mediation', {
  id: uuid('id').primaryKey().defaultRandom(),
  userID: uuid('user_id').references(() => Users.id).notNull(),
  mediatorId: uuid('mediator_id').references(() => mediator.id).notNull(),
  callerPhone: varchar('caller_phone', { length: 20 }).notNull(), // E.164 format (e.g., "+1234567890")
  callerCode: varchar('caller_code', { length: 50 }).notNull(),
  sourceLanguageId: uuid('source_language_id').references(() => Languages.id).notNull(),
  targetLanguageId: uuid('target_language_id').references(() => Languages.id).notNull(),
  status: varchar('status', { length: 50 }).notNull(), // e.g., pending, completed
  mediationDate: timestamp('mediation_date').notNull(),
  mediationDuration: decimal('mediation_duration', { precision: 5, scale: 2, }),
  amount: decimal('amount', { precision: 10, scale: 2 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
