import { pgTable, uuid } from 'drizzle-orm/pg-core';
import { interpreter } from './interpreter';
import { Languages } from './language_table';

export const interpreterSourceLanguages = pgTable('interpreter_source_languages', {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    interpreter_id: uuid('interpreter_id').references(() => interpreter.id).notNull(),
    source_language_id: uuid('source_language_id').references(() => Languages.id).notNull(),
});
export const interpreterTargetLanguages = pgTable('interpreter_target_languages', {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    interpreter_id: uuid('interpreter_id').references(() => interpreter.id).notNull(),
    target_language_id: uuid('target_language_id').references(() => Languages.id).notNull(),
});
