import { gql } from 'apollo-server';

export const typeDefs = gql`
  type Language {
    id: ID!
    language_code: Int!
    client_id: String
    language_name: String!
    created_at: String
    updated_at: String
  }

  input LanguageInput {
    language_code: Int!
    language_name: String!
    phone_number: String!
  }
  type LanguagesResponse {
    filteredCount: Int!
    languages: [Language!]!
  }
  type Query {
    sourceLanguages(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      search: String
      phone_number: String!
    ): LanguagesResponse!
     targetLanguages(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      search: String
      phone_number: String!
    ): LanguagesResponse!
    allSourceLanguages(phone_number:String!): [Language!]!
    allTargetLanguages(phone_number:String!): [Language!]!
  }

  type Mutation {
    createSourceLanguage(input: LanguageInput!): Language!
    updateSourceLanguage(id: ID!, input: LanguageInput!): Language!
    deleteSourceLanguage(id: ID!): Boolean!
    createTargetLanguage(input: LanguageInput!): Language!
    updateTargetLanguage(id: ID!, input: LanguageInput!): Language!
    deleteTargetLanguage(id: ID!): Boolean!
    syncTargetLanguagesData(phone_number:String!): String
    syncSourceLanguagesData(phone_number:String!): String
  }
`;

export default typeDefs;