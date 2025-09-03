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
    phone_number: String!
    enable_code: Boolean
    callingCodePromptText: String
    callingCodePromptFile: String
    callingCodePromptMode: String
    askSourceLanguage: Boolean
    askTargetLanguage: Boolean
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
    enableFallback: Boolean
    fallbackNumber: String
    fallbackPrompt: String
    digitsTimeOut: Int
    creditErrorText: String
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
    phone_number: String!
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
    getCallRoutingSettings(phone_number: String!): CallRoutingSettings
    allCallRoutingSettings: [CallRoutingSettings!]!
  }

  type Mutation {
    createOrUpdateCallRoutingSettings(
      input: CallRoutingSettingsInput!
    ): CallRoutingSettings!
    deleteCallRoutingSettings(client_id: ID!, phone_number: String!): Boolean!
  }
`;

export default typeDefs;
