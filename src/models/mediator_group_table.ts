import { pgTable, varchar, integer, timestamp, uuid } from 'drizzle-orm/pg-core';
import { Users } from './user_table';

export const mediatorGroup = pgTable('mediator_group', {
  id: uuid('id').primaryKey(),
  userID: uuid('userID').references(() => Users.id),
  groupName: varchar('groupName').notNull(),
  status: varchar('status').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
