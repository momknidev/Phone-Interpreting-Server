import { pgTable, uuid } from 'drizzle-orm/pg-core';
import { mediator } from './mediator';
import { Languages } from './language_table';

export const mediatorLanguageRelation = pgTable('mediator_language_relation', {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    mediatorId: uuid('mediatorId').references(() => mediator.id).notNull(),
    sourceLanguageId: uuid('sourceLanguageId').references(() => Languages.id).notNull(),
    targetLanguageId: uuid('targetLanguageId').references(() => Languages.id).notNull(),
});
