
import {
  pgTable, uuid, varchar, timestamp, decimal, text,
} from 'drizzle-orm/pg-core';
import { mediator } from './mediator';
import { Users } from './user_table';

export const RequestTable = pgTable('request', {
  id: uuid('id').primaryKey(),
  mediatorId: uuid('mediatorId').references(() => mediator.id,),
  callingUser: text('callingUser'),
  callerCode: text('callerCode'),
  userID: uuid('userID').references(() => Users.id),
  status: varchar('status', { length: 255 }).notNull(),
  mediationDate: timestamp('mediationDate').notNull(),
  language: text('language'),
  minutes: decimal('minutes'),
  amount: decimal('amount'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow()
});
