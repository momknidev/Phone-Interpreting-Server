import { pgEnum, uuid } from 'drizzle-orm/pg-core';
import {
  pgTable,
  serial,
  varchar,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { Client, clientPhones } from './client_table';
import { desc } from 'drizzle-orm';

export const SystemLogAction = pgEnum('logs_actions', [
  'LOGIN',
  'LOGOUT',
  'UPDATE',
  'CREATE',
  'DELETE',
]);

export const systemLogs = pgTable('system_logs', {
  id: uuid('id').primaryKey().notNull(),
  action: SystemLogAction('action'),
  client_id: uuid('client_id').references(() => Client.id),
  phone_number_id: uuid('phone_number_id')
    .notNull()
    .references(() => clientPhones.id, { onDelete: 'cascade' }),
  ip: varchar('ip', { length: 45 }),
  browser: varchar('browser', { length: 255 }),
  changes: jsonb('changes'),
  description: varchar('description', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
