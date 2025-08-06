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
    client_id: ID!
    phone_number: String!
    enable_code: Boolean
    callingCodePrompt: String

    askSourceLanguage: Boolean
    askTargetLanguage: Boolean
    sourceLanguagePromptPrompt: String
    targetLanguagePrompt: String

    mediatorCallAlgorithm: CallAlgorithm

    enableFallback: Boolean
    fallbackType: FallbackType
    fallbackNumber: String
    fallbackPrompt: String

    createdAt: String
    updatedAt: String
  }

  input CallRoutingSettingsInput {
    phone_number: String!
    enable_code: Boolean
    callingCodePrompt: String

    askSourceLanguage: Boolean
    askTargetLanguage: Boolean
    sourceLanguagePromptPrompt: String
    targetLanguagePrompt: String

    mediatorCallAlgorithm: CallAlgorithm

    enableFallback: Boolean
    fallbackType: FallbackType
    fallbackNumber: String
    fallbackPrompt: String
  }

  type Query {
    getCallRoutingSettings(client_id: ID!): CallRoutingSettings
    allCallRoutingSettings: [CallRoutingSettings!]!
  }

  type Mutation {
    createOrUpdateCallRoutingSettings(client_id: ID!, input: CallRoutingSettingsInput!): CallRoutingSettings!
    deleteCallRoutingSettings(client_id: ID!): Boolean!
  }
`;

export default typeDefs;
