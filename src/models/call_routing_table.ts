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

export const callAlgorithmEnum = pgEnum('call_algorithm', [
  'simultaneous',
  'sequential',
]);

export const callRoutingSettings = pgTable('call_routing_settings', {
  id: uuid('id').notNull().primaryKey(),
  client_id: uuid('client_id').notNull(),
  phone_number: varchar('phone_number').notNull(),
  enable_code: boolean('enable_code').default(true),
  callingCodePrompt: text('calling_code_prompt').default(
    'Inserisci il codice identificativo fornito',
  ),
  callingCodePromptURL: text('calling_code_prompt_url'),
  callingCodeError: text('calling_code_error'),
  askSourceLanguage: boolean('ask_source_language').default(true),
  askTargetLanguage: boolean('ask_target_language').default(true),
  sourceLanguagePrompt: text('source_language_prompt').default(
    'Seleziona la lingua di partenza',
  ),
  sourceLanguagePromptURL: text('source_language_prompt_url'),
  sourceLanguageError: text('source_language_error'),
  targetLanguagePrompt: text('target_language_prompt'),
  targetLanguagePromptURL: text('target_language_prompt_url'),
  targetLanguageError: text('target_language_error'),
  interpreterCallType: callAlgorithmEnum('interpreter_call_type').default(
    'simultaneous',
  ),
  retryAttempts: integer('retry_attempts').default(0),

  enableFallback: boolean('enable_fallback').default(false),
  fallbackNumber: varchar('fallback_number'),
  creditError: text('credit_error').default(
    'Siamo spiacenti, ma non hai abbastanza credito per effettuare questa chiamata. Per favore ricarica il tuo account e riprova.',
  ),
  noAnswerMessage: text('no_answer_message').default(
    'Siamo spiacenti, ma non siamo riusciti a connetterti con un interprete. Per favore riprova più tardi.',
  ),
  digitsTimeOut: integer('digits_time_out').default(5),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
