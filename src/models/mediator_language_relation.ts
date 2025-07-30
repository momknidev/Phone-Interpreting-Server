import { pgTable, uuid } from 'drizzle-orm/pg-core';
import { interpreter } from './interpreter';
import { Languages } from './language_table';

export const mediatorLanguageRelation = pgTable('mediator_language_relation', {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    mediator_id: uuid('mediator_id').references(() => interpreter.id).notNull(),
    source_language_id: uuid('source_language_id').references(() => Languages.id).notNull(),
    target_language_id: uuid('target_language_id').references(() => Languages.id).notNull(),
});
