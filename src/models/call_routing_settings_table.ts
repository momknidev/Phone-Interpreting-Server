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
export const callingLanguage = pgEnum('calling_language', ['english', 'italian']);

export const callRoutingSettings = pgTable('call_routing_settings', {
  clientId: uuid('client_id').notNull().primaryKey(), // Assuming one setting per client
  clientPhoneNo: varchar('client_phone_number', { length: 20 }).notNull(),
  callLanguage: callingLanguage('calling_language'), // e.g., ['EN', 'FR']

  enableCallRecording: boolean('enable_call_recording').default(false),
  enablePasswordCheck: boolean('enable_password_check').default(false),
  allowCallingCode: varchar('allow_calling_code'), // string array
  callingCodePrompt: text('calling_code_prompt'),
  passwordPromptAudioUrl: varchar('password_prompt_audio_url', { length: 255 }),

  askSourceLanguage: boolean('ask_source_language').default(false),
  askTargetLanguage: boolean('ask_target_language').default(false),
  sourceLanguagePromptTts: text('source_language_prompt_tts'),
  targetLanguagePromptTts: text('target_language_prompt_tts'),

  mediatorCallAlgorithm: callAlgorithmEnum('mediator_call_algorithm').default('sequential'),
  mediatorGroupIds: jsonb('mediator_group_ids').$type<string[]>().default([]),

  enableFallback: boolean('enable_fallback').default(false),
  fallbackType: fallbackTypeEnum('fallback_type'),
  fallbackNumber: varchar('fallback_number', { length: 20 }),
  fallbackPromptTts: text('fallback_prompt_tts'),
  fallbackPromptAudioUrl: varchar('fallback_prompt_audio_url', { length: 255 }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
