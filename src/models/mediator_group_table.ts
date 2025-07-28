import { pgTable, varchar, integer, timestamp, uuid } from 'drizzle-orm/pg-core';
import { Client } from './client_table';

export const mediatorGroup = pgTable('mediator_groups', {
  id: uuid('id').primaryKey(),
  client_id: uuid('client_id').references(() => Client.id),
  group_name: varchar('group_name').notNull(),
  status: varchar('status').notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
