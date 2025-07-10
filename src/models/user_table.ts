
import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, text } from 'drizzle-orm/pg-core';

export const Users = pgTable('users', {
  id: uuid('id').primaryKey(),
  firstName: varchar('firstName'),
  lastName: varchar('lastName'),
  email: text('email').notNull().unique(),
  password: varchar('password'),
  role: varchar('role'),
  phone: varchar('phone'),
  type: text('type'),
  avatarUrl: varchar('avatarUrl'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt')
    .notNull()
    .$onUpdate(() => new Date()),
});
