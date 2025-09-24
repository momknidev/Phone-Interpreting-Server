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
import { relations } from 'drizzle-orm';
import { Languages, LanguagesTarget } from './language_table';
import { clientPhones } from './client_table';

export const callAlgorithmEnum = pgEnum('call_algorithm', [
  'simultaneous',
  'sequential',
]);

export const callRoutingSettings = pgTable('call_routing_settings', {
  id: uuid('id').notNull().primaryKey(),
  client_id: uuid('client_id').notNull(),
  phone_number_id: uuid('phone_number_id')
    .notNull()
    .references(() => clientPhones.id, { onDelete: 'cascade' }),
  enable_code: boolean('enable_code').default(true),
  callingCodePromptText: text('calling_code_prompt_text').default(
    'Inserisci il codice identificativo fornito',
  ),
  callingCodePromptMode: text('calling_code_prompt_mode'),
  callingCodePromptFile: text('calling_code_prompt_file'),
  callingCodeErrorText: text('calling_code_error_text'),
  callingCodeErrorFile: text('calling_code_error_file'),
  callingCodeErrorMode: text('calling_code_error_mode'),

  askSourceLanguage: boolean('ask_source_language').default(true),
  askTargetLanguage: boolean('ask_target_language').default(true),
  sourceLanguageId: uuid('source_language_id').references(() => Languages.id),
  targetLanguageId: uuid('target_language_id').references(
    () => LanguagesTarget.id,
  ),
  sourceLanguagePromptText: text('source_language_prompt').default(
    'Seleziona la lingua di partenza',
  ),
  sourceLanguagePromptFile: text('source_language_prompt_file'),
  sourceLanguagePromptMode: text('source_language_prompt_mode'),

  sourceLanguageErrorText: text('source_language_error'),
  sourceLanguageErrorFile: text('source_language_error_file'),
  sourceLanguageErrorMode: text('source_language_error_mode'),

  targetLanguagePromptText: text('target_language_prompt'),
  targetLanguagePromptFile: text('target_language_prompt_File'),
  targetLanguagePromptMode: text('target_language_prompt_mode'),

  targetLanguageErrorText: text('target_language_error'),
  targetLanguageErrorFile: text('target_language_error_file'),
  targetLanguageErrorMode: text('target_language_error_mode'),

  interpreterCallType: callAlgorithmEnum('interpreter_call_type').default(
    'simultaneous',
  ),
  retryAttempts: integer('retry_attempts').default(0),
  inputAttemptsCount: integer('input_attempts').default(3),
  inputAttemptsMode: text('input_attempts_mode').default('text'),
  inputAttemptsText: text('input_attempts_text').default(
    'Input non valido. Per favore riprova.',
  ),
  inputAttemptsFile: text('input_attempts_file'),
  enableFallback: boolean('enable_fallback').default(false),
  fallbackNumber: varchar('fallback_number'),

  creditErrorText: text('credit_error_text').default(
    'Siamo spiacenti, ma non hai abbastanza credito per effettuare questa chiamata. Per favore ricarica il tuo account e riprova.',
  ),
  creditErrorFile: text('credit_error_file'),
  creditErrorMode: text('credit_error_mode'),

  noAnswerMessageText: text('no_answer_message').default(
    'Siamo spiacenti, ma non siamo riusciti a connetterti con un interprete. Per favore riprova più tardi.',
  ),
  noAnswerMessageFile: text('no_answer_file'),
  noAnswerMessageMode: text('no_answer_mode'),

  digitsTimeOut: integer('digits_time_out').default(5),

  welcomeMessageText: text('welcome_message').default(
    'Welcome To Phone Mediation',
  ),
  welcomeMessageFile: text('welcome_message_file'),
  welcomeMessageMode: text('welcome_message_mode'),

  language: varchar('language').default('en-GB'),
  //  <=============================>

  enableCallType: boolean('enable_call_type').default(false),
  defaultCallType: text('default_call_type').default('1'),
  callTypePromptText: text('call_type_prompt_text').default(
    'Press 1 for Three Way Call or 2 for Interpreter Only Call',
  ),
  callTypePromptFile: text('call_type_prompt_file'),
  callTypePromptMode: text('call_type_prompt_mode'),
  callTypeErrorText: text('call_type_error_text'),
  callTypeErrorFile: text('call_type_error_file'),
  callTypeErrorMode: text('call_type_error_mode'),
  askThirdPartyNumber: boolean('ask_third_party_number').default(false),
  thirdPartyNumberPromptText: text('third_party_number_prompt_text'),
  thirdPartyNumberPromptFile: text('third_party_number_prompt_file'),
  thirdPartyNumberPromptMode: text('third_party_number_prompt_mode'),
  thirdPartyNumberErrorText: text('third_party_number_error_text'),
  thirdPartyNumberErrorFile: text('third_party_number_error_file'),
  thirdPartyNumberErrorMode: text('third_party_number_error_mode'),
  defaultThirdPartyNumber: varchar('default_third_party_number'),
  skipThirdPartyNumber: boolean('skip_third_party_number').default(false),
  askForConfirmation: boolean('ask_for_confirmation').default(false),
  thirdPartyConfirmationPromptText: text(
    'third_party_confirmation_prompt_text',
  ),
  thirdPartyConfirmationPromptFile: text(
    'third_party_confirmation_prompt_file',
  ),
  thirdPartyConfirmationPromptMode: text(
    'third_party_confirmation_prompt_mode',
  ),
  thirdPartyConfirmationErrorText: text('third_party_confirmation_error_text'),
  thirdPartyConfirmationErrorFile: text('third_party_confirmation_error_file'),
  thirdPartyConfirmationErrorMode: text('third_party_confirmation_error_mode'),
  requireCountryCode: boolean('require_country_code').default(false),
  defaultCountryCode: varchar('default_country_code').default('+1'),
  //  <=============================>

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const callRoutingSettingsRelations = relations(
  callRoutingSettings,
  ({ one }) => ({
    clientPhone: one(clientPhones, {
      fields: [callRoutingSettings.phone_number_id],
      references: [clientPhones.id],
    }),
    sourceLanguage: one(Languages, {
      fields: [callRoutingSettings.sourceLanguageId],
      references: [Languages.id],
    }),
    targetLanguage: one(LanguagesTarget, {
      fields: [callRoutingSettings.targetLanguageId],
      references: [LanguagesTarget.id],
    }),
  }),
);
