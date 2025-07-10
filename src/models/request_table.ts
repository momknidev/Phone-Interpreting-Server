
import {
  pgTable, uuid, varchar, timestamp, decimal, text,
} from 'drizzle-orm/pg-core';
import { mediator } from './mediator';
import { Users } from './user_table';

export const RequestTable = pgTable('request', {
  id: uuid('id').primaryKey(),
  mediatorId: uuid('mediatorId').references(() => mediator.id,),
  userID: uuid('userID').references(() => Users.id),
  status: varchar('status', { length: 255 }).notNull(),
  deliveryDate: timestamp('deliveryDate').notNull(),
  language: text('language'),
  minutes: decimal('minutes').default('0'),
  notes: varchar('notes', { length: 255 }).default(''),
  amount: decimal('amount', { precision: 10, scale: 2 }),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
