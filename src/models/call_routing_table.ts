// drizzle/schema/callRoutingSettings.ts
import {
  pgTable,
  varchar,
  boolean,
  text,
  timestamp,
  uuid,
  integer,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const callAlgorithmEnum = pgEnum('call_algorithm', ['simultaneous', 'sequential']);
export const fallbackTypeEnum = pgEnum('fallback_type', ['recall', 'fixed_number']);

export const callRoutingSettings = pgTable('call_routing_settings', {
  id: uuid('id').notNull().primaryKey(),
  client_id: uuid('client_id').notNull(),
  phone_number: varchar('phone_number', { length: 20 }).notNull(),
  enable_code: boolean('enable_code').default(true),
  callingCodePrompt: text('calling_code_prompt').default('Inserisci il codice identificativo fornito'),
  callingCodePromptURL: text('calling_code_prompt_url'),

  askSourceLanguage: boolean('ask_source_language').default(true),
  askTargetLanguage: boolean('ask_target_language').default(true),
  sourceLanguagePrompt: text('source_language_prompt').default('Seleziona la lingua di partenza'),
  sourceLanguagePromptURL: text('source_language_prompt_url').default('Seleziona la lingua di destinazione'),
  targetLanguagePrompt: text('target_language_prompt'),
  targetLanguagePromptURL: text('target_language_prompt_url'),

  interpreterCallType: callAlgorithmEnum('interpreter_call_type').default('sequential'),
  retryAttempts: integer('retry_attempts').default(0),

  enableFallback: boolean('enable_fallback').default(false),

  fallbackNumber: varchar('fallback_number', { length: 20 }),
  fallbackPrompt: text('fallback_prompt_tts'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
