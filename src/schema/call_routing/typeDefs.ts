import { gql } from 'apollo-server';

export const typeDefs = gql`
  enum CallAlgorithm {
    simultaneous
    sequential
  }

  type CallRoutingSettings {
    id: ID!
    client_id: ID!
    phone_number: String!
    enable_code: Boolean
    callingCodePrompt: String
    callingCodePromptURL: String
    askSourceLanguage: Boolean
    askTargetLanguage: Boolean
    sourceLanguagePrompt: String
    sourceLanguagePromptURL: String
    sourceLanguageError: String
    callingCodeError: String
    targetLanguageError: String
    fallbackType: String
    fallbackMessage: String
    targetLanguagePrompt: String
    targetLanguagePromptURL: String

    interpreterCallType: CallAlgorithm
    retryAttempts: Int

    enableFallback: Boolean
    fallbackNumber: String
    fallbackPrompt: String
    digitsTimeOut: Int
    creditError: String
    createdAt: String
    updatedAt: String
  }

  input CallRoutingSettingsInput {
    phone_number: String!
    fallbackType: String
    fallbackMessage: String
    enable_code: Boolean
    callingCodePrompt: String
    callingCodePromptFile: Upload
    sourceLanguageError: String
    callingCodeError: String
    targetLanguageError: String
    askSourceLanguage: Boolean
    askTargetLanguage: Boolean
    sourceLanguagePrompt: String
    sourceLanguagePromptFile: Upload
    targetLanguagePrompt: String
    targetLanguagePromptFile: Upload
    digitsTimeOut: Int
    creditError: String
    interpreterCallType: CallAlgorithm
    retryAttempts: Int

    enableFallback: Boolean
    fallbackNumber: String
    fallbackPromptTTS: String
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
