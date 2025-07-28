
import {
  pgTable, uuid, varchar, timestamp, decimal, text,
} from 'drizzle-orm/pg-core';
import { mediator } from './mediator';
import { Users } from './user_table';

export const RequestTable = pgTable('phone_mediation', {
  id: uuid('id').primaryKey(),
  mediatorId: uuid('mediator_id').references(() => mediator.id,),
  callingUser: text('calling_user'),
  callerCode: text('caller_code'),
  userID: uuid('user_id').references(() => Users.id),
  status: varchar('status', { length: 255 }).notNull(),
  mediationDate: timestamp('mediation_date').notNull(),
  mediationLanguage: text('mediation_language'),
  mediationDuration: decimal('mediation_duration'),
  amount: decimal('amount'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow()
});
