import {
  numeric, pgTable, text, boolean, timestamp, uuid, varchar,
} from 'drizzle-orm/pg-core';
import { Languages } from './language_table';
import { Users } from './user_table';

export const mediator = pgTable('mediator', {
  id: uuid('id').primaryKey().notNull(),
  userID: uuid('userID').references(() => Users.id),
  firstName: varchar('firstName').notNull(),
  lastName: varchar('lastName').notNull(),
  email: text('email'),
  phone: varchar('phone').notNull(),
  IBAN: text('IBAN'),
  sourceLanguage1: varchar('sourceLanguage1').default('Italian'),
  targetLanguage1: uuid('targetLanguage1').references(() => Languages.id),
  sourceLanguage2: varchar('sourceLanguage2'),
  targetLanguage2: uuid('targetLanguage2').references(() => Languages.id),
  sourceLanguage3: varchar('sourceLanguage3'),
  targetLanguage3: uuid('targetLanguage3').references(() => Languages.id),
  sourceLanguage4: varchar('sourceLanguage4'),
  targetLanguage4: uuid('targetLanguage4').references(() => Languages.id),
  mediationCard: varchar('mediationCard'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
  status: varchar('status').default('status'),
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
