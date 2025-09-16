import { gql } from 'apollo-server';

export const typeDefs = gql`
  scalar Upload
  enum CallAlgorithm {
    simultaneous
    sequential
  }

  type CallRoutingSettings {
    id: ID!
    client_id: ID!
    phone_number_id: ID!
    enable_code: Boolean
    callingCodePromptText: String
    callingCodePromptFile: String
    callingCodePromptMode: String
    askSourceLanguage: Boolean
    askTargetLanguage: Boolean
    sourceLanguageId: ID
    targetLanguageId: ID
    sourceLanguagePromptText: String
    sourceLanguagePromptFile: String
    sourceLanguagePromptMode: String
    sourceLanguageErrorText: String
    sourceLanguageErrorFile: String
    sourceLanguageErrorMode: String
    callingCodeErrorText: String
    callingCodeErrorFile: String
    callingCodeErrorMode: String
    targetLanguageErrorText: String
    targetLanguageErrorFile: String
    targetLanguageErrorMode: String
    fallbackType: String
    fallbackMessage: String
    targetLanguagePromptText: String
    targetLanguagePromptFile: String
    targetLanguagePromptMode: String
    interpreterCallType: CallAlgorithm
    retryAttempts: Int
    inputAttemptsCount: Int
    inputAttemptsMode: String
    inputAttemptsText: String
    inputAttemptsFile: String
    enableFallback: Boolean
    fallbackNumber: String
    digitsTimeOut: Int
    creditErrorText: String
    creditErrorFile: String
    creditErrorMode: String
    noAnswerMessageText: String
    noAnswerMessageFile: String
    noAnswerMessageMode: String
    language: String
    welcomeMessageText: String
    welcomeMessageFile: String
    welcomeMessageMode: String
    createdAt: String
    updatedAt: String
  }

  input CallRoutingSettingsInput {
    phone_number_id: ID!
    fallbackType: String
    fallbackMessage: String
    enable_code: Boolean
    callingCodePromptText: String
    callingCodePromptFile: Upload
    callingCodePromptMode: String
    callingCodeErrorText: String
    callingCodeErrorFile: Upload
    callingCodeErrorMode: String
    askSourceLanguage: Boolean
    askTargetLanguage: Boolean
    sourceLanguageId: ID
    targetLanguageId: ID
    sourceLanguagePromptText: String
    sourceLanguagePromptFile: Upload
    sourceLanguagePromptMode: String
    sourceLanguageErrorText: String
    sourceLanguageErrorFile: Upload
    sourceLanguageErrorMode: String
    targetLanguagePromptText: String
    targetLanguagePromptFile: Upload
    targetLanguagePromptMode: String
    targetLanguageErrorText: String
    targetLanguageErrorFile: Upload
    targetLanguageErrorMode: String
    digitsTimeOut: Int
    creditErrorText: String
    creditErrorFile: Upload
    creditErrorMode: String
    interpreterCallType: CallAlgorithm
    retryAttempts: Int
    inputAttemptsCount: Int
    inputAttemptsMode: String
    inputAttemptsText: String
    inputAttemptsFile: Upload
    noAnswerMessageText: String
    noAnswerMessageFile: Upload
    noAnswerMessageMode: String

    language: String

    welcomeMessageText: String
    welcomeMessageFile: Upload
    welcomeMessageMode: String

    enableFallback: Boolean
    fallbackNumber: String
  }

  type Query {
    getCallRoutingSettings(phone_number_id: ID!): CallRoutingSettings
    allCallRoutingSettings: [CallRoutingSettings!]!
  }

  type Mutation {
    createOrUpdateCallRoutingSettings(
      input: CallRoutingSettingsInput!
    ): CallRoutingSettings!
    deleteCallRoutingSettings(client_id: ID!, phone_number_id: ID!): Boolean!
  }
`;

export default typeDefs;
