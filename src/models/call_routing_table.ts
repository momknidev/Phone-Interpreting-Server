// drizzle/schema/callRoutingSettings.ts
import {
  pgTable,
  varchar,
  boolean,
  text,
  jsonb,
  timestamp,
  uuid,
  integer,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const callAlgorithmEnum = pgEnum('call_algorithm', ['simultaneous', 'sequential']);
export const fallbackTypeEnum = pgEnum('fallback_type', ['recall', 'fixed_number']);

export const callRoutingSettings = pgTable('call_routing_settings', {
  client_id: uuid('client_id').notNull().primaryKey(), // Assuming one setting per client
  phone_number: varchar('phone_number', { length: 20 }).notNull(),
  enable_code: boolean('enable_code').default(false),
  callingCodePrompt: text('calling_code_prompt'),

  askSourceLanguage: boolean('ask_source_language').default(false),
  askTargetLanguage: boolean('ask_target_language').default(false),
  sourceLanguagePromptPrompt: text('source_language_prompt'),
  targetLanguagePrompt: text('target_language_prompt'),

  mediatorCallAlgorithm: callAlgorithmEnum('mediator_call_algorithm').default('sequential'),

  enableFallback: boolean('enable_fallback').default(false),
  fallbackType: fallbackTypeEnum('fallback_type'),

  fallbackNumber: varchar('fallback_number', { length: 20 }),
  fallbackPrompt: text('fallback_prompt_tts'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
