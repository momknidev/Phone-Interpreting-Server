import { gql } from 'apollo-server';

export const typeDefs = gql`
  enum CallAlgorithm {
    simultaneous
    sequential
  }

  enum FallbackType {
    recall
    fixed_number
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
    targetLanguagePrompt: String
    targetLanguagePromptURL: String

    interpreterCallType: CallAlgorithm
    retryAttempts: Int

    enableFallback: Boolean
    fallbackNumber: String
    fallbackPrompt: String

    createdAt: String
    updatedAt: String
  }

  input CallRoutingSettingsInput {
    phone_number: String!
    
    enable_code: Boolean
    callingCodePrompt: String
    callingCodePromptFile: Upload

    askSourceLanguage: Boolean
    askTargetLanguage: Boolean
    sourceLanguagePrompt: String
    sourceLanguagePromptFile: Upload
    targetLanguagePrompt: String
    targetLanguagePromptFile: Upload

    interpreterCallType: CallAlgorithm
    retryAttempts: Int

    enableFallback: Boolean
    fallbackNumber: String
    fallbackPrompt: String
  }

  type Query {
    getCallRoutingSettings(phone_number: String!): CallRoutingSettings
    allCallRoutingSettings: [CallRoutingSettings!]!
  }

  type Mutation {
    createOrUpdateCallRoutingSettings( input: CallRoutingSettingsInput!): CallRoutingSettings!
    deleteCallRoutingSettings(client_id: ID!,phone_number: String!): Boolean!
  }
`;

export default typeDefs;
