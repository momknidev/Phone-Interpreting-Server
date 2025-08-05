import { numeric, pgTable, text, boolean, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { Client } from './client_table';
import { relations } from 'drizzle-orm';
import { interpreterSourceLanguages, interpreterTargetLanguages } from './mediator_language_relation';
import { mediatorGroupRelation } from './mediator_group_relation';
import { mediatorGroup } from './mediator_group_table';
import { Languages } from './language_table';

export const interpreter = pgTable('interpreters', {
  id: uuid('id').primaryKey().notNull(),
  client_id: uuid('client_id').references(() => Client.id),
  phone_number: varchar('phone_number').notNull(),
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


export const interpretersRelations = relations(interpreter, ({ many }) => ({
  sourceLanguages: many(interpreterSourceLanguages),
  targetLanguages: many(interpreterTargetLanguages),
  groups: many(mediatorGroupRelation),

}));

export const interpreterSourceLanguagesRelations = relations(interpreterSourceLanguages, ({ one }) => ({
  interpreter: one(interpreter, { fields: [interpreterSourceLanguages.interpreter_id], references: [interpreter.id] }),
  sourceLanguage: one(Languages, { fields: [interpreterSourceLanguages.source_language_id], references: [Languages.id] }),
}));

export const interpreterTargetLanguagesRelations = relations(interpreterTargetLanguages, ({ one }) => ({
  interpreter: one(interpreter, { fields: [interpreterTargetLanguages.interpreter_id], references: [interpreter.id] }),
  targetLanguage: one(Languages, { fields: [interpreterTargetLanguages.target_language_id], references: [Languages.id] }),
}));

export const interpreterGroupsRelations = relations(mediatorGroupRelation, ({ one }) => ({
  interpreter: one(interpreter, { fields: [mediatorGroupRelation.mediator_id], references: [interpreter.id] }),
  group: one(mediatorGroup, { fields: [mediatorGroupRelation.mediator_group_id], references: [mediatorGroup.id] }),
}));

export const groupsRelations = relations(mediatorGroup, ({ many }) => ({
  mediatorGroupRelation: many(mediatorGroupRelation),
}));

