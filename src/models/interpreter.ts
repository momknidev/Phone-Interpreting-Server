import { numeric, pgTable, text, boolean, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { Client } from './client_table';

export const interpreter = pgTable('interpreters', {
  id: uuid('id').primaryKey().notNull(),
  client_id: uuid('client_id').references(() => Client.id),
  first_name: varchar('first_name').notNull(),
  last_name: varchar('last_name').notNull(),
  email: text('email'),
  phone: varchar('phone').notNull(),
  iban: text('iban'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  status: varchar('status'),
  monday_time_slots: text('monday_time_slots'),
  tuesday_time_slots: text('tuesday_time_slots'),
  wednesday_time_slots: text('wednesday_time_slots'),
  thursday_time_slots: text('thursday_time_slots'),
  friday_time_slots: text('friday_time_slots'),
  saturday_time_slots: text('saturday_time_slots'),
  sunday_time_slots: text('sunday_time_slots'),
  availableForEmergencies: boolean('availableForEmergencies').default(false),
  availableOnHolidays: boolean('availableOnHolidays').default(false),
  priority: numeric('priority'),
});
