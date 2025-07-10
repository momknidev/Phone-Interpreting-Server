import { pgTable, varchar, integer, timestamp, uuid } from 'drizzle-orm/pg-core';
import { Users } from './user_table';

export const Languages = pgTable('languages', {
  id: uuid('id').primaryKey(),
  userID: uuid('userID').references(() => Users.id),
  language_code: integer('language_code').notNull(),
  language_name: varchar('language_name', { length: 100 }).notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
