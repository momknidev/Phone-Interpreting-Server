import { numeric, pgTable, text, boolean, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { Users } from './user_table';

export const mediator = pgTable('mediator', {
  id: uuid('id').primaryKey().notNull(),
  userID: uuid('userID').references(() => Users.id),
  firstName: varchar('firstName').notNull(),
  lastName: varchar('lastName').notNull(),
  email: text('email'),
  phone: varchar('phone').notNull(),
  IBAN: text('IBAN'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
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
