
import { pgTable, uuid, varchar, timestamp, text } from 'drizzle-orm/pg-core';

export const Users = pgTable('users', {
  id: uuid('id').primaryKey(),
  firstName: varchar('first_name'),
  lastName: varchar('last_name'),
  email: text('email').notNull().unique(),
  password: varchar('password'),
  role: varchar('role'),
  phone: varchar('phone'),
  type: text('type'),
  status: varchar('status').default('active'),
  avatarUrl: varchar('avatar_url'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt')
    .notNull()
    .$onUpdate(() => new Date()),
});
