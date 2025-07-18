import { pgTable, varchar, integer, timestamp, uuid } from 'drizzle-orm/pg-core';
import { Users } from './user_table';

export const UserCode = pgTable('user_codes', {
  id: uuid('id').primaryKey(),
  userID: uuid('userID').references(() => Users.id),
  user_code: integer('language_code').notNull().unique(),
  user_name: varchar('language_name', { length: 100 }).notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
